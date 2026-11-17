// Requires the local relay + demo and Chrome; uses an isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Wallet, toUtf8Bytes } from 'ethers';
import { ZeniWalletSession } from '../../../packages/connect/dist/index.js';
import { validateDappRequest } from '../../../packages/core/dist/index.js';

const profile = mkdtempSync(join(tmpdir(), 'zeni-connect-smoke-'));
const executable = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(executable, ['--headless', '--no-first-run', '--disable-background-networking', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, peer;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !existsSync(portFile); i++) await delay(100);
  if (!existsSync(portFile)) throw new Error('Chrome DevTools did not start');
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const callbacks = new Map();
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    const cb = callbacks.get(data.id);
    if (cb) { callbacks.delete(data.id); clearTimeout(cb.timer); data.error ? cb.reject(new Error(data.error.message)) : cb.resolve(data.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { callbacks.delete(next); reject(new Error('DevTools request timed out')); }, 10000);
    callbacks.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result.value;
  };
  async function until(expression) {
    for (let i = 0; i < 150; i++) { const value = await evaluate(expression); if (value) return value; await delay(100); }
    throw new Error('Browser condition timed out: ' + expression);
  }
  await call('Page.navigate', { url: process.env.DEMO_URL || 'http://127.0.0.1:5174/' });
  await until(`document.body.textContent.includes('Connect Zeni Wallet')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Connect Zeni Wallet').click()`);
  const uri = await until(`document.querySelector('a[href^="zeni://connect"]')?.href`);
  assert.ok(await until(`document.querySelector('img[alt*="Scan"]')?.src.startsWith('data:image/png')`));
  const signer = Wallet.createRandom();
  peer = await ZeniWalletSession.pair(uri, { pollIntervalMs: 20 });
  assert.equal(peer.info.origin, 'http://127.0.0.1:5174');
  await peer.approve(signer.address, async request => {
    const intent = validateDappRequest(request.method, request.params, signer.address);
    assert.equal(intent.kind, 'message');
    return signer.signMessage(toUtf8Bytes(intent.text));
  });
  await until(`document.body.textContent.includes('Disconnect 0x')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Request signature').click()`);
  await until(`document.querySelector('output')?.textContent.includes('Verified signature from')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Disconnect 0x')).click()`);
  await until(`document.body.textContent.includes('Connect Zeni Wallet')`);
  console.log('PASS: Chrome rendered a local QR, connected through the live relay, verified a real signature, and disconnected.');
} finally {
  await peer?.disconnect().catch(() => {});
  socket?.close(); chrome.kill('SIGTERM');
}

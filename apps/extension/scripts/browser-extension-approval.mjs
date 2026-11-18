// Load the real extension in an isolated Chromium profile. All chain networking is
// blocked; only a public fixture message is signed. No transaction is broadcast.
// CHROME_BIN must support --load-extension (Chromium, Chrome for Testing, or Brave).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyMessage } from 'ethers';

assert.ok(process.env.CHROME_BIN, 'Set CHROME_BIN to an extension-capable Chromium executable.');
const directory = fileURLToPath(new URL('../dist/', import.meta.url));
const profile = mkdtempSync(join(tmpdir(), 'zeni-real-extension-'));
const browser = spawn(process.env.CHROME_BIN, ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-features=BraveWallet', `--user-data-dir=${profile}`, `--disable-extensions-except=${directory}`, `--load-extension=${directory}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const clients = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(action, label) {
  for (let i = 0; i < 150; i++) { const result = await action(); if (result) return result; await delay(100); }
  throw new Error('Timed out: ' + label);
}
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const callbacks = new Map(), listeners = new Map(); let id = 0;
  socket.onmessage = event => {
    const data = JSON.parse(event.data), callback = callbacks.get(data.id);
    if (callback) { callbacks.delete(data.id); clearTimeout(callback.timer); data.error ? callback.reject(new Error(data.error.message)) : callback.resolve(data.result); }
    if (data.method) listeners.get(data.method)?.(data.params);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id, timer = setTimeout(() => { callbacks.delete(next); reject(new Error('CDP timeout: ' + method)); }, 20000);
    callbacks.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed: ' + result.exceptionDetails.text);
    return result.result.value;
  };
  const client = { socket, call, evaluate, on: (event, callback) => listeners.set(event, callback) };
  clients.push(client); return client;
}
try {
  const activePort = join(profile, 'DevToolsActivePort');
  await until(() => existsSync(activePort), 'browser debugging port');
  const port = readFileSync(activePort, 'utf8').split('\n')[0];
  const targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  const workerTarget = await until(async () => (await targets()).find(target => target.type === 'service_worker' && target.url.endsWith('/background.js')), 'extension service worker');
  const worker = await connect(workerTarget.webSocketDebuggerUrl);
  await worker.call('Network.enable');
  await worker.call('Network.setBlockedURLs', { urls: ['https://api-testnet.qore.host/*', 'https://evm-testnet.qore.host/*'] });
  const base = workerTarget.url.slice(0, -'background.js'.length);
  async function newPage(url) {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    return connect(target.webSocketDebuggerUrl);
  }
  const control = await newPage(base + 'index.html');
  await until(() => control.evaluate('!!globalThis.chrome?.runtime?.id'), 'extension control page');
  const message = payload => control.evaluate(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify(payload)}, resolve))`);
  const created = await message({ type: 'CREATE_VAULT', mnemonic: 'test test test test test test test test test test test junk', password: 'public fixture password 013' });
  assert.equal(created.success, true);
  const address = (await message({ type: 'GET_SESSION_STATUS' })).data.activeAddress;
  const page = await newPage('about:blank');
  await page.call('Page.enable');
  await page.call('Fetch.enable', { patterns: [{ urlPattern: 'https://zeni-connect-demo.vercel.app/*' }] });
  page.on('Fetch.requestPaused', ({ requestId }) => {
    void page.call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<!doctype html><title>Approval test dApp</title><h1>Zeni approval fixture</h1>').toString('base64') });
  });
  await page.call('Page.navigate', { url: 'https://zeni-connect-demo.vercel.app/approval-fixture' });
  await until(() => page.evaluate('!!window.zeni'), 'real injected provider');
  async function request(method, params) {
    await page.evaluate(`window.result = null; window.failure = null; window.zeni.request(${JSON.stringify({ method, params })}).then(result => window.result = result, error => window.failure = {code:error.code,message:error.message}); true`);
  }
  async function approvalTarget() {
    return until(async () => (await targets()).find(target => target.url === base + 'index.html?approval=1'), 'automatic review window');
  }
  async function click(client, text) {
    await until(() => client.evaluate(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === ${JSON.stringify(text)} && !button.disabled)`), text + ' button');
    const point = await client.evaluate(`(() => { const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)}); const r=button.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  await request('eth_requestAccounts');
  const first = await approvalTarget(), review = await connect(first.webSocketDebuggerUrl);
  await click(review, 'Approve');
  assert.deepEqual(await until(() => page.evaluate('window.result'), 'connection result'), [address]);
  await request('personal_sign', ['0x48656c6c6f205a656e69', address]);
  await until(() => review.evaluate("document.body.innerText.includes('Sign message')"), 'message review');
  assert.equal((await targets()).filter(target => target.url === first.url).length, 1);
  await click(review, 'Approve');
  const signature = await until(() => page.evaluate('window.result'), 'message signature');
  assert.equal(verifyMessage('Hello Zeni', signature), address);
  await control.evaluate(`(async () => { const contexts = await chrome.runtime.getContexts({documentUrls:[${JSON.stringify(first.url)}]}); await chrome.windows.remove(contexts[0].windowId); return true; })()`);
  await until(async () => !(await targets()).some(target => target.id === first.id), 'review window closed');
  await request('zeni_sendQor', [{ from: address, to: '0x2222222222222222222222222222222222222222', value: '0xde0b6b3a7640000', chainId: '0x2648' }]);
  const second = await approvalTarget(), transfer = await connect(second.webSocketDebuggerUrl);
  assert.notEqual(second.id, first.id);
  await until(() => transfer.evaluate("document.body.innerText.includes('Review QOR transfer')"), 'transfer review');
  await click(transfer, 'Reject');
  const failure = await until(() => page.evaluate('window.failure'), 'transfer rejection');
  assert.equal(failure.code, 4001);
  assert.equal((await message({ type: 'GET_ACTIVITY' })).data.length, 0);
  console.log('PASS: real extension opens connection review, reuses its window for message signing, verifies the signature, and opens a new transfer review after closure; rejection broadcasts nothing.');
} finally {
  for (const client of clients) client.socket.close();
  const exited = new Promise(resolve => browser.once('exit', resolve));
  browser.kill('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

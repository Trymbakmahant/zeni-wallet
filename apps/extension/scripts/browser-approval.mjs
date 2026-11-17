// Exercises the built approval UI with a fake wallet transport; never broadcasts transactions.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const server = createServer((req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try { const bytes = readFileSync(path); res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(path)] || 'application/octet-stream'); res.end(bytes); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = mkdtempSync(join(tmpdir(), 'zeni-connect-smoke-'));
const executable = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(executable, ['--headless', '--no-first-run', '--disable-background-networking', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !existsSync(portFile); i++) await delay(100);
  if (!existsSync(portFile)) throw new Error('Chrome DevTools did not start');
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const callbacks = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
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
    throw new Error('Browser condition timed out: ' + expression + '\n' + await evaluate('document.body.innerText') + JSON.stringify(errors));
  }

  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.decisions = [];
    window.prepareCount = 0;
    window.rejectReviewOnce = true;
    const realTimeout = window.setTimeout;
    window.setTimeout = (callback, milliseconds, ...args) => realTimeout(callback, milliseconds === 30000 ? 100 : milliseconds, ...args);
    window.pending = [{ internalId: 'transfer-1', origin: 'https://demo.example', title: 'Zeni Connect Demo', account: '0x2222222222222222222222222222222222222222', payload: { method: 'eth_sendTransaction' }, intent: { kind: 'transfer', to: '0x3333333333333333333333333333333333333333', amount: '1.0' } }];
    const status = { isInitialized: true, isUnlocked: true, activeAddress: '0x2222222222222222222222222222222222222222', onChainBalance: '10' };
    window.chrome.runtime = { sendMessage(message, callback) {
      if (message.type === 'GET_SESSION_STATUS' || message.type === 'GET_STATUS') return callback({ success: true, data: status });
      if (message.type === 'GET_PENDING_APPROVALS') return callback({ success: true, data: structuredClone(window.pending) });
      if (message.type === 'GET_ACTIVITY') return callback({ success: true, data: [] });
      if (message.type === 'PREPARE_DAPP_APPROVAL') {
        window.prepareCount++;
        if (window.prepareCount === 1) return; // A stalled fee RPC must not disable approval forever.
        if (window.prepareCount === 2) return setTimeout(() => callback({ success: false, error: 'Fee endpoint unavailable' }), 30);
        return setTimeout(() => callback({ success: true, data: { id: 'reviewed-quote', maxNetworkFee: '0.015', windowMaxValue: '1015000', windowBlocks: 60, registrationRequired: true, expiresAt: Date.now() + 120000 } }), 30);
      }
      if (message.type === 'RESOLVE_APPROVAL') { if (message.approved && window.rejectReviewOnce) { window.rejectReviewOnce = false; return callback({ success: false, error: 'Review a fresh fee quote before approving.' }); } window.decisions.push(message); window.pending = []; return callback({ success: true, data: { resolved: true } }); }
      callback({ success: false, error: 'Unexpected wallet message' });
    } };
  ` });
  const clickText = async text => {
    await until(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === ${JSON.stringify(text)} && !button.disabled)`);
    const point = await evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)});
      const rect = button.getBoundingClientRect();
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const target = document.elementFromPoint(x, y);
      return { x, y, reachable: !!target && button.contains(target), target: target?.outerHTML.slice(0, 250) };
    })()`);
    assert.equal(point.reachable, true, 'Button is covered or outside popup: ' + JSON.stringify(point));
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  };
  const screenshot = async name => {
    if (!process.env.SCREENSHOT_DIR) return;
    mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    writeFileSync(join(process.env.SCREENSHOT_DIR, name + '.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 360, height: 600, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/index.html` });
  await until(`document.body.textContent.includes('Fee calculation timed out')`);
  await clickText('Retry fee review');
  await until(`document.body.textContent.includes('Fee endpoint unavailable')`);
  assert.ok(await evaluate(`(() => { const r = document.querySelector('#approval-status').getBoundingClientRect(); return r.top >= 0 && r.bottom < innerHeight; })()`), 'Fee errors must remain visible beside the action buttons');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Approve & send')).disabled`), true);
  assert.deepEqual(await evaluate('window.decisions'), []);
  await clickText('Retry fee review');
  await until(`document.body.textContent.includes('0.015 QOR')`);
  assert.ok(await evaluate(`document.body.textContent.includes('https://demo.example') && document.body.textContent.includes('1.0 QOR') && document.body.textContent.includes('1.015 QOR')`));
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  await screenshot('transfer-review');
  await clickText('Approve & send');
  await until(`document.querySelector('#approval-status').textContent.includes('Review a fresh fee quote')`);
  await clickText('Retry fee review');
  await until(`!Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Approve & send'))?.disabled`);
  await clickText('Approve & send');
  await until('window.decisions.length === 1');
  assert.deepEqual(await evaluate('window.decisions[0]'), { type: 'RESOLVE_APPROVAL', internalId: 'transfer-1', approved: true, quoteId: 'reviewed-quote' });
  await evaluate(`window.pending = [{ internalId: 'message-1', origin: 'https://demo.example', title: 'Zeni Connect Demo', account: '0x2222222222222222222222222222222222222222', payload: { method: 'personal_sign' }, intent: { kind: 'message', text: 'Sign in to Zeni.\\nNonce: 123456' } }];`);
  await until(`document.body.textContent.includes('Nonce: 123456')`);
  await screenshot('message-review');
  await clickText('Approve');
  await until('window.decisions.length === 2');
  assert.equal(await evaluate('window.decisions[1].approved'), true);
  assert.equal(await evaluate('window.prepareCount'), 4, 'Message signing must not fetch fees');
  await evaluate(`window.pending = [{ internalId: 'connect-1', origin: 'https://demo.example', payload: { method: 'eth_requestAccounts' } }];`);
  await until(`document.body.textContent.includes('Connect account')`);
  await clickText('Approve');
  await until('window.decisions.length === 3');
  assert.equal(await evaluate('window.decisions[2].approved'), true);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS: real mouse clicks approve connections, messages, and reviewed transfers at 360x600; stalled/failed/stale fee reviews show visible errors and recover through retry.');
} finally {
  socket?.close(); chrome.kill('SIGTERM'); server.close();
}

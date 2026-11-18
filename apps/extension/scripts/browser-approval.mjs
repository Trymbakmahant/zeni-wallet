// Exercises the built approval UI with a fake wallet transport; never broadcasts transactions.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { Interface, keccak256 } from 'ethers';
const statusAbi = new Interface(['function pqcKeyStatus(address) view returns (bool, uint8, bytes)']);
const testKey = '0x' + '42'.repeat(2592);
const statusResults = { match: statusAbi.encodeFunctionResult('pqcKeyStatus', [true, 1, testKey]), mismatch: statusAbi.encodeFunctionResult('pqcKeyStatus', [true, 1, '0x' + '43'.repeat(2592)]), unregistered: statusAbi.encodeFunctionResult('pqcKeyStatus', [false, 0, '0x']) };
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
    window.pqcMode = 'match';
    window.statusResults = ${JSON.stringify(statusResults)};
    const realFetch = window.fetch;
    window.fetch = async (url, options) => {
      if (url !== 'https://evm-testnet.qore.host') return realFetch(url, options);
      const request = JSON.parse(options.body);
      if (!['eth_chainId', 'eth_blockNumber', 'eth_call'].includes(request.method)) throw new Error('Unexpected RPC method');
      if (window.pqcMode === 'error') return new Response('', { status: 503 });
      if (window.pqcMode === 'pending') await new Promise((resolve, reject) => {
        window.finishStatus = resolve;
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
      const result = request.method === 'eth_chainId' ? '0x2648' : request.method === 'eth_blockNumber' ? '0x123' : window.statusResults[window.pqcMode];
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    };
    window.decisions = [];
    window.prepareCount = 0;
    window.rejectReviewOnce = true;
    const realTimeout = window.setTimeout;
    window.setTimeout = (callback, milliseconds, ...args) => realTimeout(callback, milliseconds === 30000 ? 100 : milliseconds, ...args);
    window.pending = [{ internalId: 'transfer-1', origin: 'https://demo.example', title: 'Zeni Connect Demo', account: '0x2222222222222222222222222222222222222222', payload: { method: 'zeni_sendQor' }, intent: { kind: 'transfer', to: '0x3333333333333333333333333333333333333333', amount: '1.0' } }];
    const status = { isInitialized: true, isUnlocked: true, activeAddress: '0x2222222222222222222222222222222222222222', onChainBalance: '10', pqcPublicKeyHash: ${JSON.stringify(keccak256(testKey))} };
    status.accounts = [{ index: 0, name: 'Account 1', address: status.activeAddress, cosmosAddress: 'qor1mock' }];
    status.activeAccountIndex = 0;
    window.walletStatus = status;
    window.chrome.runtime = { sendMessage(message, callback) {
      if (message.type === 'ADD_ACCOUNT') {
        if (message.password !== 'test wallet password') return callback({ success: false, error: 'Incorrect wallet password' });
        const index = status.accounts.length;
        status.accounts.push({ index, name: 'Account ' + (index + 1), address: '0x' + String(index + 3).repeat(40), cosmosAddress: 'qor1mock' + index });
        status.activeAccountIndex = index; status.activeAddress = status.accounts[index].address; status.onChainBalance = String(index + 10);
        return callback({ success: true, data: status.accounts });
      }
      if (message.type === 'SWITCH_ACCOUNT') {
        status.activeAccountIndex = message.index; status.activeAddress = status.accounts[message.index].address; status.onChainBalance = String(message.index + 10);
        return callback({ success: true, data: status.accounts });
      }

      if (message.type === 'GET_STATUS' && window.holdNextBalance) {
        window.holdNextBalance = false;
        const oldStatus = { ...structuredClone(status), onChainBalance: '999999' };
        window.releaseOldBalance = () => callback({ success: true, data: oldStatus });
        return;
      }
      if (message.type === 'GET_SESSION_STATUS' || message.type === 'GET_STATUS') return callback({ success: true, data: structuredClone(status) });
      if (message.type === 'GET_PENDING_APPROVALS') return callback({ success: true, data: structuredClone(window.pending) });
      if (message.type === 'GET_ACCOUNT_ACTIVITY') {
        const incoming = { hash: 'CC'.repeat(32), type: 'RECEIVE', amount: '5.0', token: 'QOR', timestamp: 1794996000000, status: 'CONFIRMED', gasCost: '', source: 'chain', nativeChain: true, from: 'qor1sender' };
        const older = { ...incoming, hash: 'DD'.repeat(32), type: 'SEND', amount: '2.0', from: undefined, to: 'qor1recipient', timestamp: 1794909600000 };
        if (message.older) window.historyOlder = true;
        return callback({ success: true, data: { items: status.activeAccountIndex === 0 ? [incoming, ...(window.historyOlder ? [older] : [])] : [], hasMore: !window.historyOlder && status.activeAccountIndex === 0, updatedAt: Date.now(), error: window.historyOffline ? 'Could not refresh on-chain history. Available activity is shown below.' : null } });
      }
      if (message.type === 'CLEAR_ACTIVITY') return callback({ success: true, data: true });
      if (message.type === 'GET_ACTIVITY') return callback({ success: true, data: [] });
      if (message.type === 'PREPARE_DAPP_APPROVAL') {
        window.prepareCount++;
        if (window.prepareCount === 1) return; // A stalled fee RPC must not disable approval forever.
        if (window.prepareCount === 2) return setTimeout(() => callback({ success: false, error: 'Fee endpoint unavailable' }), 30);
        return setTimeout(() => callback({ success: true, data: { id: 'reviewed-quote', maxNetworkFee: '0.015', kind: 'native-qor', nativeTo: 'qor1recipient', amountUqor: '1000000', registrationRequired: true, expiresAt: Date.now() + 120000 } }), 30);
      }
      if (message.type === 'RESOLVE_APPROVAL') { if (message.approved && window.rejectReviewOnce) { window.rejectReviewOnce = false; return callback({ success: false, error: 'Review a fresh fee quote before approving.' }); } window.decisions.push(message); window.pending = []; return callback({ success: true, data: { resolved: true } }); }
      callback({ success: false, error: 'Unexpected wallet message' });
    } };
  ` });
  const clickText = async text => {
    await until(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === ${JSON.stringify(text)} && !button.disabled)`);
    const point = await evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)});
      button.scrollIntoView({ block: "center" });
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
  assert.ok(await evaluate(`document.body.textContent.includes('https://demo.example') && document.body.textContent.includes('1.0 QOR') && document.body.textContent.includes('both your classical and post-quantum keys')`));
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
  await clickText('Settings');
  await until(`document.body.textContent.includes('Matches this wallet')`);
  assert.ok(await evaluate(`!document.body.textContent.includes('50 QOR / day') && !document.body.textContent.includes('Hybrid dApp Authentication Active')`));
  await screenshot('settings-registered');
  for (const [mode, text] of [['unregistered', 'No PQC key registered'], ['mismatch', 'Registered key differs'], ['error', 'Could not verify registration']]) {
    await evaluate(`window.pqcMode = ${JSON.stringify(mode)}`);
    await clickText('Refresh registration');
    await until(`document.body.textContent.includes(${JSON.stringify(text)})`);
  }
  await evaluate(`window.pqcMode = 'pending'`);
  await clickText('Refresh registration');
  await until(`document.body.textContent.includes('Checking Diana testnet')`);
  assert.ok(await evaluate(`!document.body.textContent.includes('Registered key differs') && !document.body.textContent.includes('Matches this wallet')`));
  await clickText('Home'); // Aborts the pending request on unmount.
  await evaluate(`window.pqcMode = 'match'`);
  await clickText('Settings');
  await until(`document.body.textContent.includes('Matches this wallet')`);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  await screenshot('settings-final');
  console.log('PASS: Settings shows matching, mismatched, unregistered, error and loading states; retry recovers and leaving Settings cancels the request.');
  async function openAccounts() {
    await evaluate(`document.querySelector('button[aria-haspopup="dialog"]').click()`);
    await until(`!!document.querySelector('dialog[open]')`);
  }
  async function fillPassword(value) {
    await evaluate(`(() => {
      const input = document.querySelector('#account-password');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }
  await clickText('Home');
  await evaluate(`window.holdNextBalance = true; document.querySelector('button[title="Refresh balances"]').click()`);
  await until(`typeof window.releaseOldBalance === 'function'`);
  await openAccounts();
  await clickText('Add account');
  await until(`document.activeElement.id === 'account-password'`);
  await fillPassword('wrong password');
  await clickText('Create account');
  await until(`document.body.textContent.includes('Incorrect wallet password')`);
  assert.equal(await evaluate('window.walletStatus.accounts.length'), 1);
  await fillPassword('test wallet password');
  await clickText('Create account');
  await until(`!document.querySelector('dialog') && document.querySelector('button[aria-haspopup="dialog"]').textContent.includes('Account 2')`);
  await evaluate('window.releaseOldBalance()');
  await delay(100);
  assert.ok(await evaluate(`!document.body.textContent.includes('999')`), 'Late balances from Account 1 must not appear in Account 2');
  await openAccounts();
  await clickText('Add account');
  await fillPassword('test wallet password');
  await clickText('Create account');
  await until(`!document.querySelector('dialog') && document.querySelector('button[aria-haspopup="dialog"]').textContent.includes('Account 3')`);
  await openAccounts();
  assert.equal(await evaluate(`document.querySelectorAll('dialog button[aria-pressed]').length`), 3);
  assert.ok(await evaluate(`document.querySelector('dialog').getBoundingClientRect().width <= innerWidth`));
  await screenshot('account-switcher');
  await evaluate(`Array.from(document.querySelectorAll('dialog button[aria-pressed]')).find(button => button.textContent.startsWith('Account 1')).click()`);
  await until(`!document.querySelector('dialog') && document.querySelector('button[aria-haspopup="dialog"]').textContent.includes('Account 1')`);
  await clickText('Home');
  await until(`document.body.textContent.includes('10')`);
  await openAccounts();
  console.log('PASS: account selector creates Account 2 and Account 3, rejects a wrong password, switches back to Account 1, fits the popup and focuses the password field.');
  await evaluate(`document.querySelector('button[aria-label="Close account selector"]').click()`);
  await clickText('Activity');
  await until(`document.body.textContent.includes('Received 5.0 QOR')`);
  assert.equal(await evaluate(`document.querySelectorAll('article').length`), 1);
  await clickText('Load older activity');
  await until(`document.body.textContent.includes('Sent 2.0 QOR')`);
  await evaluate(`window.historyOffline = true; document.querySelector('button[aria-label="Refresh activity"]').click()`);
  await until(`document.body.textContent.includes('Could not refresh on-chain history')`);
  assert.ok(await evaluate(`document.body.textContent.includes('Received 5.0 QOR')`));
  await evaluate(`window.historyOffline = false; document.querySelector('button[aria-label="Refresh activity"]').click()`);
  await until(`!document.body.textContent.includes('Could not refresh on-chain history')`);
  await evaluate(`document.querySelector('button[aria-label="Clear local activity"]').click()`);
  await clickText('Clear local records');
  await until(`!document.body.textContent.includes('Clear completed local records?')`);
  assert.ok(await evaluate(`document.body.textContent.includes('Received 5.0 QOR')`), 'Clearing local history must preserve public incoming transfers');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  await screenshot('incoming-activity');
  console.log('PASS: Activity shows incoming payments, loads older external sends, preserves receipts during network failures, retries successfully, and keeps chain history after clearing local records.');
  if (process.env.BROWSER_REVIEW_MS) {
    console.log(`Browser review: CDP ${port}; http://127.0.0.1:${server.address().port}/index.html`);
    await delay(Math.min(Number(process.env.BROWSER_REVIEW_MS), 60000));
  }
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS: real mouse clicks approve connections, messages, and reviewed transfers at 360x600; stalled/failed/stale fee reviews show visible errors and recover through retry.');
} finally {
  socket?.close(); chrome.kill('SIGTERM'); server.close();
}

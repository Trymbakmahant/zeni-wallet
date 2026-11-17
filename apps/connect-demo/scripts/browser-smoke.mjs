// Requires the local relay + demo and Chrome; uses an isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Wallet, toUtf8Bytes } from 'ethers';
import { ZeniWalletSession, ZeniError } from '../../../packages/connect/dist/index.js';
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
    throw new Error('Browser condition timed out: ' + expression + '\n' + await evaluate('document.body.innerText'));
  }
  const url = process.env.DEMO_URL || 'http://127.0.0.1:5174/';
  const screenshot = async name => {
    if (!process.env.SCREENSHOT_DIR) return;
    mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
    writeFileSync(join(process.env.SCREENSHOT_DIR, name + '.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  };
  const input = async (selector, text) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus(); document.querySelector(${JSON.stringify(selector)}).select()`);
    await call('Input.insertText', { text });
  };
  const click = async selector => {
    await until(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const explorerHash = 'CD'.repeat(32);
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    const fetchOriginal = window.fetch;
    window.explorerLookups = 0;
    window.fetch = (...args) => {
      if (String(args[0]).startsWith('https://api-testnet.qore.host/cosmos/tx/v1beta1/txs?')) {
        window.explorerLookups++;
        const hash = new URL(args[0]).searchParams.get('query').split("'")[1];
        return Promise.resolve(new Response(JSON.stringify({ tx_responses: window.explorerLookups === 1 ? [] : [{ txhash: '${explorerHash}', events: [{ type: 'ethereum_tx', attributes: [{ key: 'ethereumTxHash', value: hash }] }] }] }), { status: 200 }));
      }
      return fetchOriginal(...args);
    };
  ` });
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1150, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url });
  await until(`!!document.querySelector('.wallet-connect')`);
  await delay(700); await screenshot('desktop');
  assert.equal(await evaluate(`document.querySelector('.request-button').disabled`), true);
  await click('.wallet-connect');
  await until(`!!document.querySelector('.mobile-option')`);
  await click('.mobile-option');
  await until(`document.querySelector('a[href^="zeni://connect"]')?.href`);
  assert.ok(await until(`document.querySelector('img[alt*="Scan"]')?.src.startsWith('data:image/png')`));
  await screenshot('pairing');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await until(`!document.querySelector('.pairing-dialog')?.open && !document.querySelector('.wallet-connect').disabled`);
  await click('.wallet-connect');
  await until(`!!document.querySelector('.mobile-option')`);
  await click('.mobile-option');
  const uri = await until(`document.querySelector('a[href^="zeni://connect"]')?.href`);
  const signer = Wallet.createRandom();
  peer = await ZeniWalletSession.pair(uri, { pollIntervalMs: 20 });
  assert.equal(peer.info.origin, new URL(url).origin);
  let reject = false, requestCount = 0;
  const testHash = '0x' + 'ab'.repeat(32); // Mock response; no chain transaction is broadcast.
  await peer.approve(signer.address, async request => {
    requestCount++;
    const intent = validateDappRequest(request.method, request.params, signer.address);
    if (reject) throw new ZeniError(4001, 'User rejected request');
    await delay(500);
    if (intent.kind === 'message') return signer.signMessage(toUtf8Bytes(intent.text));
    assert.equal(intent.amount, '1.0');
    assert.equal(intent.to.toLowerCase(), '0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a');
    return testHash;
  });
  await until(`!!document.querySelector('.account-box')`);
  await until(`!document.querySelector('.pairing-dialog')?.open`);
  await click('form:has(#message) .request-button');
  await until(`document.querySelector('output')?.textContent.includes('Verified signature from')`);
  await screenshot('signature');
  await evaluate(`document.querySelector('[role="tab"][aria-selected="true"]').focus()`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
  await until(`document.querySelector('[role="tab"][aria-selected="true"]').textContent.includes('Send QOR')`);
  await input('#recipient', 'qor1invalid');
  await click('form:has(#recipient) .request-button');
  await until(`document.querySelector('output')?.textContent.includes('Enter a valid')`);
  assert.equal(requestCount, 1, 'Invalid input must not reach the wallet');
  await input('#recipient', 'qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp');
  await input('#amount', '1');
  await click('form:has(#recipient) .request-button');
  await until(`document.querySelector('output')?.textContent.includes('Transaction submitted.')`);
  assert.equal(requestCount, 2);
  assert.ok(await evaluate(`document.querySelector('output').textContent.includes('not yet confirmed')`));
  await until(`document.querySelector('output')?.textContent.includes('Waiting for explorer indexing')`);
  assert.equal(await evaluate(`!!document.querySelector('output a[href^="https://explore.qore.network/tx/"]')`), false);
  await click('output .switch-mobile');
  await until(`document.querySelector('output a[href^="https://explore.qore.network/tx/"]')?.href.endsWith('${explorerHash}')`);
  await screenshot('transfer');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.scrollTo(0, 0)'); await delay(200); await screenshot('mobile');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile page overflows');
  await evaluate(`document.querySelector('.request-workspace').scrollIntoView()`); await screenshot('mobile-transfer');
  await click('[role="tab"]');
  reject = true;
  await click('form:has(#message) .request-button');
  await until(`document.querySelector('output')?.textContent.includes('User rejected request')`);
  await click('.disconnect-button');
  await until(`!!document.querySelector('.wallet-connect')`);
  await click('.wallet-connect');
  await until(`!!document.querySelector('.mobile-option')`);
  await click('.mobile-option');
  await until(`document.querySelector('img[alt*="Scan"]')?.src.startsWith('data:image/png')`);
  await screenshot('mobile-pairing');
  assert.ok(await evaluate(`document.querySelector('.pairing-dialog').getBoundingClientRect().width <= innerWidth`));
  await click('.cancel-pairing');

  // A different injected wallet must never be selected in place of Zeni.
  await evaluate(`window.ethereum = { request() { throw new Error('Other wallet was called'); } }`);
  await click('.wallet-connect');
  await until(`!!document.querySelector('.extension-option')`);
  await screenshot('connection-options');
  await click('.extension-option');
  await until(`document.querySelector('.dialog-error')?.textContent.includes('not detected')`);
  assert.equal(await evaluate(`!!document.querySelector('.qr-stage')`), false);
  await click('.cancel-pairing');

  // No relay may be needed for browser-extension discovery, signing, or transfers.
  await evaluate(`window.originalFetch = window.fetch; window.relayCalls = []; window.fetch = (...args) => { const url = String(args[0]); if (url.includes('/v1/sessions')) { window.relayCalls.push(url); throw new Error('Relay disabled during extension checks'); } return window.originalFetch(...args); };`);
  // EIP-6963 discovery, approval errors, chain validation, and stale approval handling.
  await evaluate(`
    window.extensionCalls = [];
    window.extensionMode = 'reject';
    window.extensionAccounts = ['${signer.address}'];
    window.extensionChain = '0x2648';
    window.extensionSignature = ${JSON.stringify(await signer.signMessage('Hello from Zeni Connect'))};
    window.mockZeni = {
      isZeni: true,
      async request({ method, params }) {
        window.extensionCalls.push(method);
        if (method === 'eth_requestAccounts') {
          if (window.extensionMode === 'reject') throw new Error('User rejected connection');
          if (window.extensionMode === 'pending') return new Promise(resolve => window.approveExtension = resolve);
          return window.extensionAccounts;
        }
        if (method === 'eth_accounts') return window.extensionAccounts;
        if (method === 'eth_chainId') return window.extensionChain;
        if (window.extensionMode === 'reject') throw new Error('User rejected request');
        if (method === 'personal_sign') return window.extensionSignature;
        if (method === 'eth_sendTransaction') { window.lastExtensionTransfer = params[0]; return '${testHash}'; }
        throw new Error('Unsupported extension request: ' + method);
      }
    };
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'io.qorechain.zeni' }, provider: window.mockZeni } })));
  `);
  await click('.wallet-connect');
  await until(`document.querySelector('.extension-option')?.textContent.includes('Zeni detected')`);
  assert.deepEqual(await evaluate('window.extensionCalls'), [], 'Discovery must not request accounts');
  await click('.extension-option');
  await until(`document.querySelector('.dialog-error')?.textContent.includes('User rejected connection')`);
  await evaluate(`window.extensionMode = 'approve'; window.extensionChain = '0x1'`);
  await click('.retry-extension');
  await until(`document.querySelector('.dialog-error')?.textContent.includes('Diana testnet')`);
  assert.equal(await evaluate(`!!document.querySelector('.account-box')`), false);
  await evaluate(`window.extensionChain = '0x2648'; window.extensionMode = 'pending'`);
  await click('.retry-extension');
  await until(`typeof window.approveExtension === 'function'`);
  await click('.cancel-pairing');
  await evaluate(`window.approveExtension(window.extensionAccounts)`);
  await delay(150);
  assert.equal(await evaluate(`!!document.querySelector('.account-box')`), false, 'Cancelled approval must not connect');
  await evaluate(`window.extensionMode = 'approve'`);
  await click('.wallet-connect');
  await until(`!!document.querySelector('.extension-option')`);
  await click('.extension-option');
  await until(`document.querySelector('.wallet-heading')?.textContent.includes('Browser extension')`);
  await until(`!document.querySelector('.pairing-dialog')?.open`);
  assert.equal(await evaluate(`document.querySelector('.account-box code').title`), signer.address);
  assert.equal(await evaluate(`document.querySelector('.request-button').disabled`), false);
  assert.equal(await evaluate(`!!document.querySelector('.account-open')`), false);
  await click('form:has(#message) .request-button');
  await until(`document.querySelector('output')?.textContent.includes('Verified signature from')`);
  await evaluate(`document.querySelectorAll('[role="tab"]')[1].click()`);
  await click('form:has(#recipient) .request-button');
  await until(`document.querySelector('output')?.textContent.includes('Transaction submitted.')`);
  assert.equal(await evaluate(`window.lastExtensionTransfer.from`), signer.address);
  assert.equal(await evaluate(`window.lastExtensionTransfer.to`), 'qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp');
  await evaluate(`window.extensionMode = 'reject'`);
  await click('form:has(#recipient) .request-button');
  await until(`document.querySelector('output')?.textContent.includes('User rejected request')`);
  await evaluate(`window.extensionMode = 'approve'`);
  await screenshot('extension-connected');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  await evaluate(`window.extensionAccounts = []; window.dispatchEvent(new Event('focus'))`);
  await until(`!!document.querySelector('.wallet-connect')`);
  await until(`document.querySelector('.connection-error')?.textContent.includes('locked or disconnected')`);
  await evaluate(`window.extensionAccounts = ['${signer.address}']`);
  await click('.wallet-connect');
  await until(`!!document.querySelector('.extension-option')`);
  await click('.extension-option');
  await until(`!!document.querySelector('.extension-note')`);
  assert.deepEqual(await evaluate('window.relayCalls'), [], 'Extension path must not contact the relay');
  await evaluate('window.fetch = window.originalFetch');
  await click('.extension-note .switch-mobile');
  await until(`document.querySelector('img[alt*="Scan"]')?.src.startsWith('data:image/png')`);
  assert.equal(await evaluate(`!!document.querySelector('.account-box')`), false);
  await click('.cancel-pairing');
  assert.ok(await evaluate(`window.extensionCalls.every(method => ['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'personal_sign', 'eth_sendTransaction'].includes(method))`), 'Only supported RPC methods sent to extension');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS: local QR, Escape/cancel, relay connection, real signature verification, keyboard tabs, QOR address validation, mocked transfer submission, rejection, disconnect, mobile layout, extension discovery, rejected/cancelled approvals, network validation, lock detection, extension message/transfer requests without a relay, and switching to mobile.');

} finally {
  await peer?.disconnect().catch(() => {});
  socket?.close(); chrome.kill('SIGTERM');
}

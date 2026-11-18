// Requires the local relay + docs app and Chrome; uses an isolated temporary browser profile.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Wallet, toUtf8Bytes } from 'ethers';
import { ZeniWalletSession, ZeniError } from '../../../packages/connect/dist/index.js';
import { validateDappRequest } from '../../../packages/core/dist/index.js';

const profile = mkdtempSync(join(tmpdir(), 'zeni-docs-smoke-'));
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
  const url = process.env.DOCS_URL || 'http://127.0.0.1:3016/docs#playground';
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
  const signer = Wallet.fromPhrase('test test test test test test test test test test test junk');
  const transferHash = 'AB'.repeat(32);
  const codeSelector = '.pg-code-panel pre code';
  const payloadFromCode = async () => JSON.parse((await evaluate(`document.querySelector('${codeSelector}').textContent`)).split('const request = ')[1].split(';\n\nconst ')[0]);
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url });
  await until(`!!document.querySelector('.pg-mobile')`);
  await delay(500);
  await evaluate(`document.querySelector('.connect-playground').scrollIntoView({behavior: 'instant', block: 'center'})`);
  await screenshot('docs-playground');
  assert.equal(await evaluate(`document.querySelector('.pg-submit').disabled`), true);
  assert.equal(await evaluate(`!!document.querySelector('#playground iframe')`), false);
  await click('.pg-extension');
  await until(`document.querySelector('.pg-error')?.textContent.includes('not detected')`);
  await click('.pg-mobile');
  await until(`document.querySelector('.pg-pairing img')?.src.startsWith('data:image/png')`);
  await click('.pg-cancel');
  await until(`!document.querySelector('.pg-pairing') && !document.querySelector('.pg-cancel')`);
  await click('.pg-mobile');
  const uri = await until(`document.querySelector('.pg-pairing a')?.href`);
  assert.equal(await evaluate(`document.querySelector('${codeSelector}').textContent.includes('zeni://connect#')`), false, 'Pairing secret must not enter the code panel');
  const qr = await until(`document.querySelector('.pg-pairing img')?.src`);
  assert.ok(qr.startsWith('data:image/png'));
  await screenshot('docs-pairing');
  peer = await ZeniWalletSession.pair(uri, { pollIntervalMs: 100 });
  assert.equal(peer.info.name, 'Zeni Docs Playground');
  assert.equal(peer.info.origin, new URL(url).origin);
  const requests = [];
  let rejectRequest = false;
  await peer.approve(signer.address, async request => {
    requests.push({ method: request.method, params: request.params });
    if (rejectRequest) throw new ZeniError(4001, 'User rejected request');
    const intent = validateDappRequest(request.method, request.params, signer.address);
    return intent.kind === 'message' ? signer.signMessage(toUtf8Bytes(intent.text)) : transferHash;
  });
  await until(`document.querySelector('.pg-account')?.textContent.includes('Mobile wallet')`);
  await input('#pg-message', 'Hello from the embedded docs!');
  const expectedMessage = await payloadFromCode();
  await click('form:has(#pg-message) .pg-submit');
  await until(`document.querySelector('.pg-result-success')?.textContent.includes('Signature verified')`);
  assert.deepEqual(requests[0], expectedMessage, 'The displayed code must match the mobile request exactly');
  await click('#playground [role=tab][id$="transfer"]');
  await input('#pg-recipient', 'qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp');
  await input('#pg-amount', '0.0000001');
  await click('form:has(#pg-amount) .pg-submit');
  await until(`document.querySelector('.pg-result-error')?.textContent.includes('6 decimal')`);
  assert.equal(requests.length, 1, 'Invalid precision cannot reach the wallet');
  await input('#pg-amount', '0.001');
  await input('#pg-recipient', 'qor1invalid');
  await click('form:has(#pg-amount) .pg-submit');
  await until(`document.querySelector('.pg-result-error')?.textContent.includes('valid QoreChain')`);
  assert.equal(requests.length, 1);
  await input('#pg-recipient', 'qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp');
  const expectedTransfer = await payloadFromCode();
  await click('form:has(#pg-amount) .pg-submit');
  await until(`document.querySelector('.pg-result-success')?.textContent.includes('Native transfer confirmed')`);
  assert.deepEqual(requests.at(-1), expectedTransfer);
  assert.equal(await evaluate(`document.querySelector('.pg-result a').href`), 'https://explore.qore.network/tx/' + transferHash);
  rejectRequest = true;
  await click('form:has(#pg-amount) .pg-submit');
  await until(`document.querySelector('.pg-result-error')?.textContent.includes('User rejected request')`);
  assert.ok(await evaluate(`document.querySelector('.pg-result-error').textContent.includes('Check wallet Activity')`));
  await click('.pg-disconnect');
  await peer.disconnect().catch(() => {}); peer = null;
  await until(`!!document.querySelector('.pg-extension')`);

  // Prompt customization and exact clipboard contents, using a controlled clipboard in headless Chrome.
  await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedText = value; } } })`);
  await input('#prompt-app-name', 'Acme Store');
  await click('#ai-prompt .docs-code-bar button');
  await until(`window.copiedText?.includes('Acme Store')`);
  assert.equal(await evaluate('window.copiedText'), await evaluate(`document.querySelector('#ai-prompt pre').textContent`));
  assert.ok(await evaluate(`window.copiedText.includes('zeni_sendQor') && window.copiedText.includes('not published on npm') && window.copiedText.includes('useBrowserWallet')`));
  await evaluate(`document.querySelector('#prompt-framework').value = 'JavaScript / TypeScript'; document.querySelector('#prompt-framework').dispatchEvent(new Event('change', {bubbles:true}))`);
  await until(`document.querySelector('#ai-prompt pre').textContent.includes('use EIP-6963')`);
  await evaluate(`document.querySelector('#ai-prompt').scrollIntoView({behavior:'instant'})`);
  await screenshot('docs-ai-prompt');

  // Extension discovery must not initiate accounts or use the mobile relay.
  await evaluate(`
    window.extensionCalls = []; window.relayCalls = [];
    window.extensionChain = '0x2648'; window.extensionMode = 'approve';
    window.extensionAccounts = ['${signer.address}'];
    window.extensionSignature = ${JSON.stringify(await signer.signMessage('Hello from Zeni Docs'))};
    window.originalFetch = window.fetch;
    window.fetch = (...args) => { if (String(args[0]).includes('/v1/sessions')) window.relayCalls.push(String(args[0])); return window.originalFetch(...args); };
    window.mockZeni = { isZeni: true, async request({method,params}) {
      window.extensionCalls.push({method,params});
      if (method === 'eth_requestAccounts') {
        if (window.extensionMode === 'reject') throw new Error('User rejected connection');
        if (window.extensionMode === 'pending') return new Promise(resolve => window.approveExtension = resolve);
        return window.extensionAccounts;
      }
      if (method === 'eth_accounts') return window.extensionAccounts;
      if (method === 'eth_chainId') return window.extensionChain;
      if (method === 'personal_sign') return window.extensionSignature;
      if (method === 'zeni_sendQor') return '${transferHash}';
      throw new Error('Unsupported extension request');
    }};
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {detail:{info:{rdns:'io.qorechain.zeni'}, provider:window.mockZeni}})));
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  `);
  assert.deepEqual(await evaluate('window.extensionCalls'), []);
  await evaluate(`window.extensionMode = 'reject'`);
  await click('.pg-extension');
  await until(`document.querySelector('.pg-error')?.textContent.includes('User rejected connection')`);
  await evaluate(`window.extensionMode = 'pending'`);
  await click('.pg-extension');
  await until(`typeof window.approveExtension === 'function'`);
  await click('.pg-cancel');
  await evaluate(`window.approveExtension(window.extensionAccounts)`);
  await delay(150);
  assert.equal(await evaluate(`!!document.querySelector('.pg-account')`), false);
  await evaluate(`window.extensionMode = 'approve'; window.extensionChain = '0x1'`);
  await click('.pg-extension');
  await until(`document.querySelector('.pg-error')?.textContent.includes('Diana testnet')`);
  await evaluate(`window.extensionChain = '0x2648'`);
  await click('.pg-extension');
  await until(`document.querySelector('.pg-account')?.textContent.includes('Browser extension')`);
  await click('#playground [role=tab][id$="message"]');
  await input('#pg-message', 'Hello from Zeni Docs');
  const extensionMessage = await payloadFromCode();
  await click('form:has(#pg-message) .pg-submit');
  await until(`document.querySelector('.pg-result-success')?.textContent.includes('Signature verified')`);
  assert.deepEqual((await evaluate('window.extensionCalls')).find(x => x.method === 'personal_sign'), extensionMessage);
  await evaluate(`window.extensionSignature = ${JSON.stringify(await Wallet.createRandom().signMessage('Hello from Zeni Docs'))}`);
  await click('form:has(#pg-message) .pg-submit');
  await until(`document.querySelector('.pg-result-error')?.textContent.includes('Signature verification failed')`);
  await click('#playground [role=tab][id$="transfer"]');
  const extensionTransfer = await payloadFromCode();
  await click('form:has(#pg-amount) .pg-submit');
  await until(`document.querySelector('.pg-result-success')?.textContent.includes('Native transfer confirmed')`);
  assert.deepEqual((await evaluate('window.extensionCalls')).find(x => x.method === 'zeni_sendQor'), extensionTransfer);
  assert.deepEqual(await evaluate('window.relayCalls'), [], 'Extension flow must never contact the relay');
  await evaluate(`window.extensionAccounts = []; window.dispatchEvent(new Event('focus'))`);
  await until(`!document.querySelector('.pg-account')`);
  assert.equal(await evaluate(`document.querySelector('.pg-submit').disabled`), true);

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('#playground').scrollIntoView({behavior:'instant'})`);
  await delay(150);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No horizontal overflow on mobile');
  await screenshot('docs-mobile');
  await evaluate(`document.querySelector('#ai-prompt').scrollIntoView({behavior:'instant'})`);
  await screenshot('docs-prompt-mobile');
  await click('.docs-header-demo');
  await until(`location.hash === '#playground'`);
  assert.equal(await evaluate('location.pathname'), '/docs');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS: embedded docs QR pairing, cancellation, real encrypted signing and verification, exact live-code payloads, native transfer validation and mocked receipts, rejection, prompt customization/copy, direct extension discovery/signing/transfers without relay, wrong-signature rejection, account/network changes, mobile layout, and in-page navigation. No funded transactions sent.');
} finally {
  await peer?.disconnect().catch(() => {});
  socket?.close(); chrome.kill('SIGTERM');
}

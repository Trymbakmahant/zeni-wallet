import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as ethers from 'ethers';
import { validateDappRequest, mergeAccountActivity } from '../../../packages/core/dist/index.js';

const source = readFileSync(new URL('../src/background/service-worker.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const testWallet = new ethers.Wallet('0x' + '11'.repeat(32));
const keys = { classicalPrivateKey: testWallet.privateKey, classicalAddress: testWallet.address, cosmosAddress: 'qor123', pqcSeedHex: 'SECRET', pqcContext: 'SECRET', pqcPublicKeyHash: 'public' };

function fixture() {
  let now = 1000;
  const stored = {};
  const events = {};
  let decryptGate, prepareGate, sendGate, historyGate, windowGate;
  const windows = new Map(), createdWindows = [], focusedWindows = [];
  let windowFailure = false;
  let chainItems = [], historyFailure = false, historyCalls = 0;
  const transfers = [];
  let prepared = 0;
  let accessLevel;
  const sender = { id: 'wallet-id', url: 'chrome-extension://wallet-id/index.html' };
  const local = {
    async setAccessLevel(value) { accessLevel = value.accessLevel; },
    async get() { return structuredClone(stored); },
    async set(data) { Object.assign(stored, structuredClone(data)); },
    async clear() { for (const key of Object.keys(stored)) delete stored[key]; },
  };
  const chrome = {
    storage: { local, session: { remove() {} } },
    runtime: { getContexts: async () => Array.from(windows.values()).map(w => ({ windowId: w.id })), id: 'wallet-id', getURL: (path) => `chrome-extension://wallet-id/${path}`,
      onMessage: { addListener: (cb) => { events.message = cb; } },
      onConnect: { addListener: (cb) => { events.connect = cb; } },
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    windows: {
      onRemoved: { addListener: cb => { events.windowRemoved = cb; } },
      async create(options) {
        createdWindows.push(options);
        if (windowGate) await windowGate;
        if (windowFailure) throw new Error('Window unavailable');
        const window = { ...options, id: createdWindows.length + 10 };
        windows.set(window.id, window); return window;
      },
      async update(id, options) {
        if (!windows.has(id)) throw new Error('Window closed');
        focusedWindows.push({ id, ...options }); return windows.get(id);
      },
      async remove(id) { windows.delete(id); events.windowRemoved(id); },
    },
  };
  const core = {
    QORECHAIN_CONFIG: { rpcUrls: ['https://example.invalid'], chainId: 9800 },
    QoreChainClient: class { provider = {}; },
    deriveAccountKeys: (_mnemonic, _passphrase, index = 0) => index === 0 ? ({ ...keys }) : ({ ...keys,
      classicalAddress: ethers.getAddress('0x' + String(index + 1).padStart(40, '0')), cosmosAddress: `qor-account-${index}`, pqcPublicKeyHash: `hash-${index}`,
    }), isValidMnemonic: (value) => value === 'valid mnemonic',
    encryptVault: async (payload, password) => ({ payload, password }),
    decryptVault: async (envelope, password) => {
      if (decryptGate) await decryptGate;
      if (password !== envelope.password) throw new Error('Wrong password');
      return structuredClone(envelope.payload);
    },
    repairPqcPublicKeyHash: (value) => value,
    AmmSwapClient: class { async balances() { return { QOR: "0", fUSD: "0", fETH: "0", fBTC: "0" }; } },
    validateDappRequest, mergeAccountActivity,
    AccountActivityClient: class {
      async page() {
        historyCalls++;
        if (historyGate) await historyGate;
        if (historyFailure) throw new Error('Network offline');
        return { items: structuredClone(chainItems), nextCursor: null };
      }
    },
    QorTransferClient: class {
      async prepare(account, to, amount) {
        if (prepareGate) await prepareGate;
        prepared++;
        return { id: `quote-${prepared}`, from: account.classicalAddress, to, amount, value: ethers.parseEther(amount).toString(), expiresAt: now + 120000, maxNetworkFee: '0.01', kind: 'native-qor', nativeTo: 'qor1mock', amountUqor: '1000000' };
      }
      async send(account, quote, guard, observeRegistration, observeTransfer) {
        if (sendGate) await sendGate;
        guard();
        transfers.push({ account: account.classicalAddress, quote });
        const hash = 'AB'.repeat(32);
        await observeTransfer({ hash, status: 'PENDING', feeUqor: '10000' });
        await observeTransfer({ hash, status: 'CONFIRMED', feeUqor: '10000' });
        return hash;
      }
    },
  };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(compiled, {
    exports: {}, require: (name) => name === '@zeni/core' ? core : ethers,
    chrome, crypto: globalThis.crypto, URL, Date: Clock, setTimeout: () => 1, clearTimeout() {}, console,
  });
  const message = (type, payload = {}, from = sender) => new Promise((resolve) => events.message({ type, ...payload }, from, resolve));
  const port = (origin = 'https://dapp.example', overrides = {}) => {
    const messages = [];
    let onMessage, onDisconnect;
    const p = { name: 'zeni-dapp-bridge', sender: { id: sender.id, url: `${origin}/page`, origin, tab: { id: 1 }, frameId: 0, ...overrides },
      disconnected: false, postMessage: (msg) => messages.push(msg), disconnect() { this.disconnected = true; onDisconnect?.(); },
      onMessage: { addListener: (cb) => { onMessage = cb; } }, onDisconnect: { addListener: (cb) => { onDisconnect = cb; } },
    };
    events.connect(p);
    return { p, messages, request: (method, clientReqId = 1, params) => onMessage({ clientReqId, payload: { method, params } }), malformed: (msg) => onMessage(msg) };
  };
  return { stored, message, port, transfers, createdWindows, focusedWindows,
    closeWindow: () => chrome.windows.remove(Array.from(windows.keys())[0]),
    failWindows: () => { windowFailure = true; }, deferWindow: gate => { windowGate = gate; },
    recoverWindow: () => windows.set(99, { id: 99 }), prepared: () => prepared, deferPrepare: gate => { prepareGate = gate; }, deferSend: gate => { sendGate = gate; }, now: (value) => { now = value; }, access: () => accessLevel,
    deferDecrypt: (gate) => { decryptGate = gate; },
    history: (items, fail = false) => { chainItems = items; historyFailure = fail; },
    deferHistory: gate => { historyGate = gate; }, historyCalls: () => historyCalls,
    create: () => message('CREATE_VAULT', { mnemonic: 'valid mnemonic', password: 'strong password' }),
  };
}

test('content scripts cannot invoke privileged wallet messages', async () => {
  const f = fixture();
  const result = await f.message('CREATE_VAULT', {}, { id: 'wallet-id', url: 'https://evil.example' });
  assert.equal(result.success, false);
  assert.equal(f.stored.encryptedVault, undefined);
  assert.equal(f.access(), 'TRUSTED_CONTEXTS');
});

test('creation validates credentials, returns no keys, and cannot overwrite a vault', async () => {
  const f = fixture();
  assert.equal((await f.message('CREATE_VAULT', { mnemonic: 'invalid', password: 'strong password' })).success, false);
  assert.equal((await f.message('CREATE_VAULT', { mnemonic: 'valid mnemonic', password: 'short' })).success, false);
  const created = await f.create();
  assert.equal(created.success, true);
  assert.equal(created.data, true);
  assert.equal((await f.create()).success, false);
  await f.message('LOCK_VAULT');
  const unlocked = await f.message('UNLOCK_VAULT', { password: 'strong password' });
  assert.equal(unlocked.success, true);
  assert.equal(unlocked.data, true);
});

test('locking during decryption cancels the unlock', async () => {
  const f = fixture(); await f.create(); await f.message('LOCK_VAULT');
  let release;
  f.deferDecrypt(new Promise((resolve) => { release = resolve; }));
  const unlocking = f.message('UNLOCK_VAULT', { password: 'strong password' });
  await new Promise((resolve) => setImmediate(resolve));
  await f.message('LOCK_VAULT'); release();
  assert.equal((await unlocking).success, false);
  assert.equal((await f.message('GET_SESSION_STATUS')).data.isUnlocked, false);
});

test('wall-clock expiry locks even if the timer was suspended', async () => {
  const f = fixture(); await f.create(); f.now(1_000_000);
  assert.equal((await f.message('GET_SESSION_STATUS')).data.isUnlocked, false);
  assert.equal((await f.message('EXPORT_MNEMONIC', { password: 'strong password' })).success, false);
});

test('dApp bridge rejects foreign, opaque, and subframe senders', () => {
  const f = fixture();
  for (const overrides of [{ id: 'foreign' }, { frameId: 1 }, { origin: 'null' }, { url: 'file:///tmp/page' }]) {
    assert.equal(f.port('https://dapp.example', overrides).p.disconnected, true);
  }
});

test('unauthorized signing, unsupported methods, and malformed requests cannot create approvals', async () => {
  const f = fixture(), p = f.port();
  for (const method of ['zeni_sendQor', 'personal_sign', 'eth_signTypedData_v4']) {
    await p.request(method);
    assert.equal(p.messages.at(-1).error.code, method === 'eth_signTypedData_v4' ? 4200 : 4100);
  }
  await p.malformed(null);
  assert.equal(p.messages.at(-1).error.code, -32600);
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 0);
});

test('approvals are bounded, expire, and are removed on disconnect', async () => {
  const f = fixture(), p = f.port();
  await p.request('eth_requestAccounts'); await p.request('eth_requestAccounts', 2);
  assert.equal(p.messages.at(-1).error.code, -32002);
  const pending = (await f.message('GET_PENDING_APPROVALS')).data;
  assert.equal(pending.length, 1);
  f.now(301001);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending[0].internalId, approved: true })).success, false);
  assert.equal(p.messages.at(-1).error.code, 4001);
  await p.request('eth_requestAccounts'); p.p.disconnect();
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 0);
});

test('only unlocked user-approved origins receive accounts; locking hides accounts', async () => {
  const f = fixture(), p = f.port(); await f.create();
  await p.request('eth_accounts'); assert.equal(p.messages.at(-1).result.length, 0);
  await p.request('eth_requestAccounts');
  const pending = (await f.message('GET_PENDING_APPROVALS')).data[0];
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true })).success, true);
  assert.equal(p.messages.at(-1).result[0], keys.classicalAddress);
  await f.message('LOCK_VAULT'); await p.request('eth_accounts');
  assert.equal(p.messages.at(-1).result.length, 0);
});

test('unsupported token sends fail without fabricated hashes or history', async () => {
  const f = fixture(); await f.create();
  assert.equal((await f.message('EXECUTE_TRANSFER', { token: 'fUSD', amount: '1', to: '0x123' })).success, false);
  assert.equal(f.stored.activityHistory, undefined);
});

const transaction = { from: keys.classicalAddress, to: '0x' + '22'.repeat(20), value: '0xde0b6b3a7640000', chainId: '0x2648' };
async function connected() {
  const f = fixture(); await f.create();
  const p = f.port(); await p.request('eth_requestAccounts');
  const pending = (await f.message('GET_PENDING_APPROVALS')).data[0];
  await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true });
  p.messages.length = 0;
  return { f, p };
}
const pendingRequest = async f => (await f.message('GET_PENDING_APPROVALS')).data[0];

test('message signatures require explicit approval and verify against the requested account', async () => {
  const { f, p } = await connected();
  const text = 'Hello from the browser';
  await p.request('personal_sign', 20, [ethers.hexlify(ethers.toUtf8Bytes(text)), keys.classicalAddress]);
  assert.equal(p.messages.length, 0);
  const pending = await pendingRequest(f);
  assert.equal(pending.intent.text, text);
  assert.equal(JSON.stringify(pending).includes(keys.classicalPrivateKey), false);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true })).success, true);
  assert.equal(ethers.verifyMessage(text, p.messages.at(-1).result), keys.classicalAddress);
  assert.equal(p.messages.at(-1).clientReqId, 20);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true })).success, false);
});

test('signing rejects invalid account, chain, calldata, unsupported fields, and hidden message characters', async () => {
  const { f, p } = await connected();
  for (const tx of [{ ...transaction, from: transaction.to }, { ...transaction, chainId: '0x1' }, { ...transaction, data: '0x1234' }, { ...transaction, nonce: '0x1' }, { ...transaction, to: 'qor1invalid' }]) {
    await p.request('zeni_sendQor', 1, [tx]);
    assert.equal(p.messages.at(-1).error.code, -32602);
  }
  await p.request('personal_sign', 2, ['0x00', keys.classicalAddress]);
  assert.equal(p.messages.at(-1).error.code, -32602);
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 0);
  assert.equal(f.transfers.length, 0);
});

test('QOR transfers require the displayed quote and explicit approval, then record the submitted hash', async () => {
  const { f, p } = await connected();
  await p.request('zeni_sendQor', 42, [{ ...transaction, to: 'qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp' }]);
  const pending = await pendingRequest(f);
  assert.equal(pending.intent.to.toLowerCase(), '0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a');
  assert.equal(f.prepared(), 0);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true })).success, false);
  const review = await f.message('PREPARE_DAPP_APPROVAL', { internalId: pending.internalId });
  assert.equal(review.success, true);
  assert.equal(f.transfers.length, 0);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true, quoteId: 'wrong' })).success, false);
  const result = await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true, quoteId: review.data.id });
  assert.equal(result.success, true, result.error);
  assert.equal(f.transfers.length, 1);
  assert.equal(p.messages.at(-1).clientReqId, 42);
  assert.equal(p.messages.at(-1).result, 'AB'.repeat(32));
  assert.equal(f.stored.activityHistory[0].status, 'CONFIRMED');
  assert.equal(f.stored.activityHistory[0].nativeChain, true);
  assert.equal(f.stored.activityHistory[0].hash, p.messages.at(-1).result);
});

test('rejecting a reviewed transfer sends no transaction', async () => {
  const { f, p } = await connected();
  await p.request('zeni_sendQor', 1, [transaction]);
  const pending = await pendingRequest(f);
  await f.message('PREPARE_DAPP_APPROVAL', { internalId: pending.internalId });
  await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: false });
  assert.equal(p.messages.at(-1).error.code, 4001);
  assert.equal(f.transfers.length, 0);
});

test('expired fee quotes cannot be approved', async () => {
  const { f, p } = await connected();
  await p.request('zeni_sendQor', 1, [transaction]);
  const pending = await pendingRequest(f);
  const review = await f.message('PREPARE_DAPP_APPROVAL', { internalId: pending.internalId });
  f.now(121001);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true, quoteId: review.data.id })).success, false);
  assert.equal(f.transfers.length, 0);
});

test('locking or closing the requesting page during execution prevents signing/broadcast', async () => {
  for (const cancel of ['lock', 'disconnect']) {
    const { f, p } = await connected();
    await p.request('zeni_sendQor', 1, [transaction]);
    const pending = await pendingRequest(f);
    const review = await f.message('PREPARE_DAPP_APPROVAL', { internalId: pending.internalId });
    let release;
    f.deferSend(new Promise(resolve => { release = resolve; }));
    const approval = f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true, quoteId: review.data.id });
    await new Promise(resolve => setImmediate(resolve));
    if (cancel === 'lock') await f.message('LOCK_VAULT'); else p.p.disconnect();
    release();
    assert.equal((await approval).success, false);
    assert.equal(f.transfers.length, 0);
  }
});

test('locking during fee preparation invalidates the review', async () => {
  const { f, p } = await connected();
  await p.request('zeni_sendQor', 1, [transaction]);
  const pending = await pendingRequest(f);
  let release;
  f.deferPrepare(new Promise(resolve => { release = resolve; }));
  const preparing = f.message('PREPARE_DAPP_APPROVAL', { internalId: pending.internalId });
  await new Promise(resolve => setImmediate(resolve));
  await f.message('LOCK_VAULT'); release();
  assert.equal((await preparing).success, false);
  assert.equal(f.transfers.length, 0);
});


test('content bridge forwards bounded signing parameters only for same-page requests', () => {
  const contentSource = readFileSync(new URL('../src/content/content.ts', import.meta.url), 'utf8');
  const contentCompiled = ts.transpileModule(contentSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let listener;
  const forwarded = [], responses = [];
  const window = { location: { origin: 'https://dapp.example' }, addEventListener: (_, cb) => { listener = cb; }, postMessage: value => responses.push(value) };
  const port = { onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, postMessage: value => forwarded.push(value) };
  const document = { head: { firstChild: null, insertBefore() {} }, createElement: () => ({ setAttribute() {} }) };
  vm.runInNewContext(contentCompiled, { window, document, console, chrome: { runtime: { getURL: path => path, connect: () => port } } });
  const request = params => ({ source: window, origin: window.location.origin, data: { target: 'zeni-content-bridge', clientReqId: 1, payload: { method: 'zeni_sendQor', params } } });
  listener(request([transaction]));
  assert.deepEqual(JSON.parse(JSON.stringify(forwarded[0].payload.params)), [transaction]);
  listener({ ...request([transaction]), origin: 'https://evil.example' });
  assert.equal(forwarded.length, 1);
  listener(request(['x'.repeat(12001)]));
  const cyclic = []; cyclic.push(cyclic); listener(request(cyclic));
  assert.equal(responses.length, 2);
  assert.ok(responses.every(response => response.error.code === -32602));
  assert.equal(forwarded.length, 1);
});


test('a late fee response cannot replace the newer review the user sees', async () => {
  const { f, p } = await connected();
  await p.request('zeni_sendQor', 1, [transaction]);
  const pending = await pendingRequest(f);
  let release;
  f.deferPrepare(new Promise(resolve => { release = resolve; }));
  const oldReview = f.message('PREPARE_DAPP_APPROVAL', { internalId: pending.internalId });
  await new Promise(resolve => setImmediate(resolve));
  f.deferPrepare(undefined);
  const currentReview = await f.message('PREPARE_DAPP_APPROVAL', { internalId: pending.internalId });
  release();
  assert.equal((await oldReview).success, false);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true, quoteId: currentReview.data.id })).success, true);
  assert.equal(f.transfers.length, 1);
});

test('legacy EVM transfer requests cannot fall back to classical signing', async () => {
  const { f, p } = await connected();
  await p.request('eth_sendTransaction', 1, [transaction]);
  assert.equal(p.messages.at(-1).error.code, 4200);
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 0);
  assert.equal(f.transfers.length, 0);
});

test('adds sequential accounts without exposing keys and preserves selection across unlock', async () => {
  const f = fixture(); await f.create();
  for (const index of [1, 2]) {
    const result = await f.message('ADD_ACCOUNT', { password: 'strong password' });
    assert.equal(result.success, true);
    assert.equal(result.data.length, index + 1);
    assert.equal(result.data[index].name, `Account ${index + 1}`);
    assert.deepEqual(Object.keys(result.data[index]).sort(), ['address', 'cosmosAddress', 'index', 'name']);
    assert.equal(new Set(result.data.map(account => account.address)).size, index + 1);
    const status = (await f.message('GET_SESSION_STATUS')).data;
    assert.equal(status.activeAccountIndex, index);
    assert.equal(status.activeAddress, result.data[index].address);
  }
  assert.equal(f.stored.encryptedVault.payload.accounts.length, 3);
  await f.message('SWITCH_ACCOUNT', { index: 0 });
  await f.message('LOCK_VAULT');
  assert.equal((await f.message('GET_SESSION_STATUS')).data.accounts.length, 0);
  await f.message('UNLOCK_VAULT', { password: 'strong password' });
  assert.equal((await f.message('GET_SESSION_STATUS')).data.activeAccountIndex, 0);
  assert.equal((await f.message('GET_SESSION_STATUS')).data.accounts.length, 3);
});

test('wrong password, locked wallet, and invalid indices cannot change accounts', async () => {
  const f = fixture(); await f.create();
  assert.equal((await f.message('ADD_ACCOUNT', { password: 'wrong' })).success, false);
  assert.equal(f.stored.encryptedVault.payload.accounts.length, 1);
  for (const index of [-1, 1, 1.5, '0', null, 2147483648]) {
    assert.equal((await f.message('SWITCH_ACCOUNT', { index })).success, false);
  }
  await f.message('LOCK_VAULT');
  assert.equal((await f.message('ADD_ACCOUNT', { password: 'strong password' })).success, false);
  assert.equal((await f.message('SWITCH_ACCOUNT', { index: 0 })).success, false);
});

test('account creation serializes mutations and aborts if locked during password verification', async () => {
  const f = fixture(); await f.create();
  let release;
  f.deferDecrypt(new Promise(resolve => { release = resolve; }));
  const adding = f.message('ADD_ACCOUNT', { password: 'strong password' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.message('ADD_ACCOUNT', { password: 'strong password' })).success, false);
  assert.equal((await f.message('SWITCH_ACCOUNT', { index: 0 })).success, false);
  await f.message('LOCK_VAULT'); release();
  assert.equal((await adding).success, false);
  assert.equal(f.stored.encryptedVault.payload.accounts.length, 1);
  assert.equal((await f.message('GET_SESSION_STATUS')).data.isUnlocked, false);
});

test('changing accounts rejects old approvals, clears quotes, and requires website reconnection', async () => {
  const { f, p } = await connected();
  const quote = await f.message('PREPARE_QOR_TRANSFER', { to: transaction.to, amount: '1' });
  assert.equal(quote.success, true);
  await p.request('personal_sign', 60, [ethers.hexlify(ethers.toUtf8Bytes('Account 1 only')), keys.classicalAddress]);
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 1);
  assert.equal((await f.message('ADD_ACCOUNT', { password: 'strong password' })).success, true);
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 0);
  assert.ok(p.messages.some(message => message.clientReqId === 60 && message.error?.code === 4001));
  assert.ok(p.messages.some(message => message.event === 'accountsChanged' && message.accounts.length === 0));
  await p.request('eth_accounts', 61);
  assert.equal(p.messages.at(-1).result.length, 0);
  assert.equal((await f.message('EXECUTE_TRANSFER', { to: transaction.to, amount: '1', token: 'QOR', quoteId: quote.data.id })).success, false);
  assert.equal(f.transfers.length, 0);
  await p.request('eth_requestAccounts', 62);
  const pending = await pendingRequest(f);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true })).success, true);
  assert.equal(p.messages.at(-1).result[0], (await f.message('GET_SESSION_STATUS')).data.activeAddress);
});

test('account switches are blocked while a reviewed transfer is executing', async () => {
  const { f, p } = await connected();
  await p.request('zeni_sendQor', 1, [transaction]);
  const pending = await pendingRequest(f);
  const quote = await f.message('PREPARE_DAPP_APPROVAL', { internalId: pending.internalId });
  let release;
  f.deferSend(new Promise(resolve => { release = resolve; }));
  const sending = f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true, quoteId: quote.data.id });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.message('ADD_ACCOUNT', { password: 'strong password' })).success, false);
  assert.equal((await f.message('SWITCH_ACCOUNT', { index: 0 })).success, false);
  release(); assert.equal((await sending).success, true);
});

test('activity and clearing history are scoped to the selected account; legacy entries stay with Account 1', async () => {
  const f = fixture(); await f.create();
  await f.message('ADD_ACCOUNT', { password: 'strong password' });
  const second = (await f.message('GET_SESSION_STATUS')).data;
  f.stored.activityHistory = [
    { hash: 'legacy', status: 'CONFIRMED' },
    { hash: 'first', account: keys.cosmosAddress, status: 'CONFIRMED' },
    { hash: 'second', account: second.cosmosAddress, status: 'CONFIRMED' },
  ];
  assert.deepEqual(Array.from((await f.message('GET_ACTIVITY')).data, entry => entry.hash), ['second']);
  await f.message('CLEAR_ACTIVITY');
  assert.deepEqual(f.stored.activityHistory.map(entry => entry.hash), ['legacy', 'first']);
  await f.message('SWITCH_ACCOUNT', { index: 0 });
  assert.deepEqual(Array.from((await f.message('GET_ACTIVITY')).data, entry => entry.hash), ['legacy', 'first']);
});

test('untrusted content scripts cannot add or switch accounts', async () => {
  const f = fixture(); await f.create();
  for (const type of ['ADD_ACCOUNT', 'SWITCH_ACCOUNT']) {
    const result = await f.message(type, { index: 0, password: 'strong password' }, { id: 'wallet-id', url: 'https://evil.example' });
    assert.equal(result.success, false);
  }
});

test('provider delivers validated account-change events and supports removing listeners', () => {
  const providerSource = readFileSync(new URL('../src/inpage/inpage.ts', import.meta.url), 'utf8');
  const providerCompiled = ts.transpileModule(providerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let messageListener;
  const window = { location: { origin: 'https://dapp.example' }, addEventListener: (event, listener) => { if (event === 'message') messageListener = listener; }, dispatchEvent() {}, postMessage() {} };
  vm.runInNewContext(providerCompiled, { window, CustomEvent: class {}, setTimeout, clearTimeout, console });
  const seen = [];
  const listener = accounts => seen.push([...accounts]);
  assert.equal(window.zeni.on('accountsChanged', listener), window.zeni);
  const emit = (accounts, origin = window.location.origin) => messageListener({ source: window, origin, data: { target: 'zeni-inpage-response', event: 'accountsChanged', accounts } });
  emit([]); assert.equal(seen.length, 1);
  emit(['secret-not-an-address']); emit([keys.classicalAddress], 'https://evil.example');
  assert.equal(seen.length, 1);
  emit([keys.classicalAddress]); assert.deepEqual(seen[1], [keys.classicalAddress]);
  window.zeni.removeListener('accountsChanged', listener); emit([]);
  assert.equal(seen.length, 2);
});

test('chain receipts merge incoming transfers with local activity and are not removed by clearing local history', async () => {
  const f = fixture(); await f.create();
  const item = { hash: 'CC'.repeat(32), type: 'RECEIVE', account: keys.cosmosAddress, amount: '7', token: 'QOR', timestamp: 5000, status: 'CONFIRMED', gasCost: '', source: 'chain', nativeChain: true };
  f.history([item]);
  f.stored.activityHistory = [{ ...item, source: 'local', status: 'PENDING' }];
  let result = await f.message('GET_ACCOUNT_ACTIVITY');
  assert.equal(result.success,true); assert.equal(result.data.items.length,1);
  assert.equal(result.data.items[0].status,'CONFIRMED');
  await f.message('CLEAR_ACTIVITY');
  result=await f.message('GET_ACCOUNT_ACTIVITY');
  assert.equal(result.data.items.length,1); assert.equal(result.data.items[0].type,'RECEIVE');
  assert.equal(f.historyCalls(),1,'Fresh chain history should be cached');
});
test('history failure preserves cached incoming transfers and exposes an error', async () => {
  const f = fixture(); await f.create();
  const item = { hash:'DD'.repeat(32),type:'RECEIVE',account:keys.cosmosAddress,timestamp:10,status:'CONFIRMED',gasCost:'',source:'chain' };
  f.history([item]); await f.message('GET_ACCOUNT_ACTIVITY');
  f.history([],true);
  const result=await f.message('GET_ACCOUNT_ACTIVITY',{force:true});
  assert.equal(result.data.items.length,1); assert.match(result.data.error,/Could not refresh/);
});
test('an account switch prevents a delayed chain history response reaching the old popup request', async () => {
  const f=fixture(); await f.create();
  let release;f.deferHistory(new Promise(resolve=>{release=resolve;}));
  const pending=f.message('GET_ACCOUNT_ACTIVITY');
  await new Promise(resolve=>setImmediate(resolve));
  await f.message('ADD_ACCOUNT',{password:'strong password'});
  release(); assert.equal((await pending).success,false);
});
test('chain history stays separate for each account and is hidden while locked', async () => {
  const f=fixture();await f.create();
  f.history([{hash:'AA'.repeat(32),type:'RECEIVE',account:keys.cosmosAddress,timestamp:1,status:'CONFIRMED',gasCost:'',source:'chain'}]);
  await f.message('GET_ACCOUNT_ACTIVITY');
  await f.message('ADD_ACCOUNT',{password:'strong password'});f.history([]);
  assert.equal((await f.message('GET_ACCOUNT_ACTIVITY')).data.items.length,0);
  await f.message('SWITCH_ACCOUNT',{index:0});
  assert.equal((await f.message('GET_ACCOUNT_ACTIVITY')).data.items.length,1);
  await f.message('LOCK_VAULT');
  assert.equal((await f.message('GET_ACCOUNT_ACTIVITY')).data.items.length,0);
});


test('connection and signing requests automatically open one trusted review window', async () => {
  const f = fixture(), p = f.port(); await f.create();
  await p.request('eth_requestAccounts');
  assert.equal(f.createdWindows.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.createdWindows[0])), {
    url: 'chrome-extension://wallet-id/index.html?approval=1', type: 'popup', width: 400, height: 680, focused: true,
  });
  const pending = (await f.message('GET_PENDING_APPROVALS')).data[0];
  await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true });
  await p.request('personal_sign', 2, ['0x6869', keys.classicalAddress]);
  assert.equal(f.createdWindows.length, 1);
  assert.equal(f.focusedWindows.length, 1);
  await f.closeWindow();
  assert.equal(p.messages.at(-1).error.code, 4001);
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 0);
  await p.request('zeni_sendQor', 3, [transaction]);
  assert.equal(f.createdWindows.length, 2);
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data[0].intent.kind, 'transfer');
  assert.equal(f.transfers.length, 0);
});

test('simultaneous approval requests cannot spawn multiple windows', async () => {
  const f = fixture();
  let release;
  f.deferWindow(new Promise(resolve => { release = resolve; }));
  const requests = Array.from({ length: 5 }, (_, i) => f.port(`https://app${i}.example`).request('eth_requestAccounts'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.createdWindows.length, 1);
  release(); await Promise.all(requests);
  assert.equal(f.createdWindows.length, 1);
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 5);
  await f.closeWindow();
  assert.equal((await f.message('GET_PENDING_APPROVALS')).data.length, 0);
});

test('existing review window is recovered after worker restart and focused', async () => {
  const f = fixture(); f.recoverWindow();
  await f.port().request('eth_requestAccounts');
  assert.equal(f.createdWindows.length, 0);
  assert.equal(f.focusedWindows[0].id, 99);
});

test('window creation failure retains the request for toolbar approval', async () => {
  const f = fixture(), p = f.port(); await f.create(); f.failWindows();
  await p.request('eth_requestAccounts');
  const pending = (await f.message('GET_PENDING_APPROVALS')).data[0];
  assert.ok(pending);
  assert.equal((await f.message('RESOLVE_APPROVAL', { internalId: pending.internalId, approved: true })).success, true);
  assert.equal(p.messages.at(-1).result[0], keys.classicalAddress);
});

test('unauthorized and malformed requests never open review windows', async () => {
  const f = fixture(), p = f.port();
  await p.request('personal_sign', 1, ['0x6869', keys.classicalAddress]);
  await p.request('zeni_sendQor', 2, [transaction]);
  await p.malformed(null);
  assert.equal(f.createdWindows.length, 0);
});

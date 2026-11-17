import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/background/service-worker.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const keys = { classicalPrivateKey: 'SECRET', classicalAddress: '0x123', cosmosAddress: 'qor123', pqcSeedHex: 'SECRET', pqcContext: 'SECRET', pqcPublicKeyHash: 'public' };

function fixture() {
  let now = 1000;
  const stored = {};
  const events = {};
  let decryptGate;
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
    runtime: { id: 'wallet-id', getURL: (path) => `chrome-extension://wallet-id/${path}`,
      onMessage: { addListener: (cb) => { events.message = cb; } },
      onConnect: { addListener: (cb) => { events.connect = cb; } },
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    windows: { create() { throw new Error('Untrusted pages must not open approval windows'); } },
  };
  const core = {
    QORECHAIN_CONFIG: { rpcUrls: ['https://example.invalid'], chainId: 9800 },
    QoreChainClient: class { provider = {}; },
    deriveAccountKeys: () => ({ ...keys }), isValidMnemonic: (value) => value === 'valid mnemonic',
    encryptVault: async (payload, password) => ({ payload, password }),
    decryptVault: async (envelope, password) => {
      if (decryptGate) await decryptGate;
      if (password !== envelope.password) throw new Error('Wrong password');
      return structuredClone(envelope.payload);
    },
    repairPqcPublicKeyHash: (value) => value,
    AmmSwapClient: class {},
  };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(compiled, {
    exports: {}, require: (name) => name === '@zeni/core' ? core : {},
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
    return { p, messages, request: (method, clientReqId = 1) => onMessage({ clientReqId, payload: { method } }), malformed: (msg) => onMessage(msg) };
  };
  return { stored, message, port, now: (value) => { now = value; }, access: () => accessLevel,
    deferDecrypt: (gate) => { decryptGate = gate; },
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

test('unsupported signing and malformed requests cannot create approvals', async () => {
  const f = fixture(), p = f.port();
  for (const method of ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4']) {
    await p.request(method);
    assert.equal(p.messages.at(-1).error.code, 4200);
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

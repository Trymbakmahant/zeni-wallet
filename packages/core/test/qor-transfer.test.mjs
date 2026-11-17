import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ethers } from 'ethers';
import { qorechainTypes, verifyProofOfPossession, clearSignBytesCache, pqcSign, pqcVerify } from '@qorechain/sdk';
import { deriveAccountKeys, derivePqcKeypair, repairPqcPublicKeyHash, QorTransferClient, windowValueUqor, parseAccountSequence } from '../dist/index.js';

// Inspect the signed wire format with the same protobuf dependency used by the SDK.
const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve('@qorechain/sdk'));
const { TxRaw, TxBody, AuthInfo } = sdkRequire('cosmjs-types/cosmos/tx/v1beta1/tx');
const account = deriveAccountKeys('test test test test test test test test test test test junk');
const recipient = '0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a';
const keypair = derivePqcKeypair(account);

function fixture(options = {}) {
  clearSignBytesCache();
  const state = { registered: options.registered ?? false, sequence: 0n, events: [], native: [], evm: [], ...options };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  class Provider extends ethers.JsonRpcProvider {
    constructor() { super('https://example.invalid', 9800, { staticNetwork: true }); }
    async getCode() { return options.code ?? '0x'; }
    async send(method) {
      switch (method) {
        case 'eth_chainId': return options.chainId ?? '0x2648';
        case 'eth_gasPrice': return ethers.toQuantity(112500000000n);
        case 'eth_getBalance': return ethers.toQuantity(ethers.parseEther(options.balance ?? '10'));
        case 'eth_getTransactionCount': state.events.push('nonce'); return ethers.toQuantity(state.sequence);
        default: throw new Error(`Unexpected EVM call: ${method}`);
      }
    }
    async broadcastTransaction(raw) {
      if (options.evmFailure) throw new Error('Network timeout');
      const tx = ethers.Transaction.from(raw);
      assert.equal(tx.from, account.classicalAddress);
      assert.equal(tx.nonce, Number(state.sequence));
      assert.equal(tx.chainId, 9800n);
      state.events.push('evm'); state.evm.push(tx);
      return { hash: tx.hash };
    }
  }
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/node_info')) return json({ default_node_info: { network: 'qorechain-diana' } });
    if (path.includes('/pqc/v1/account/')) {
      if (options.statusFailure) return json({ message: 'unavailable' }, 503);
      return json(state.registered ? { found: true, account: { public_key: ethers.encodeBase64(options.mismatch ? new Uint8Array(2592) : keypair.publicKey), possession_proven: options.possessionProven ?? true } } : { found: false, account: null });
    }
    if (path.endsWith('/feemarket/v1/params')) return json({ params: { min_gas_price: '100000000000' } });
    if (path.endsWith('/protocol_features')) return json({ features: [{ name: 'pqc-sign-bytes-v2', enabled: true, known: true }] });
    if (path.includes('/auth/v1beta1/accounts/')) return json({ account: { account_number: '15980', sequence: state.sequence.toString() } });
    if (path.endsWith('/simulate') || (path.endsWith('/txs') && init?.method === 'POST')) {
      const raw = TxRaw.decode(ethers.decodeBase64(JSON.parse(init.body).tx_bytes));
      const body = TxBody.decode(raw.bodyBytes);
      const auth = AuthInfo.decode(raw.authInfoBytes);
      assert.equal(auth.signerInfos[0].sequence, state.sequence);
      assert.equal(auth.signerInfos[0].publicKey.typeUrl, '/cosmos.evm.crypto.v1.ethsecp256k1.PubKey');
      assert.equal(raw.signatures[0].length, 64);
      const message = body.messages[0];
      const registration = message.typeUrl.endsWith('MsgRegisterPQCKeyV2');
      if (registration) {
        const decoded = qorechainTypes.pqc.MsgRegisterPQCKeyV2.decode(message.value);
        assert.equal(body.extensionOptions.length, 0);
        assert.ok(verifyProofOfPossession({ chainId: 'qorechain-diana', account: account.cosmosAddress, publicKey: decoded.publicKey, proof: decoded.proofOfPossession }));
      } else {
        assert.ok(state.registered, 'registration must be committed before the window');
        assert.equal(body.extensionOptions[0].typeUrl, '/qorechain.pqc.v1.PQCHybridSignature');
        assert.ok(body.extensionOptions[0].value.length > 4627);
        const window = qorechainTypes.pqc.MsgOpenEVMWindow.decode(message.value);
        assert.equal(window.maxTxs, '1');
        assert.equal(window.blocks, '60');
        assert.equal(window.nativeOnly, true);
        assert.deepEqual(window.allowedTargets, [ethers.getAddress(recipient)]);
        assert.equal(window.maxValue, '1002363');
      }
      if (path.endsWith('/simulate')) {
        if (options.onSimulate) options.onSimulate();
        return json({ gas_info: { gas_used: options.simulatedGas ?? '100000' } });
      }
      state.events.push(registration ? 'register' : 'window');
      state.native.push({ registration, auth });
      state.lastRegistration = registration;
      return json({ tx_response: { code: options.checkCode ?? 0, raw_log: 'CheckTx refused' } });
    }
    if (path.includes('/txs/')) {
      state.events.push('confirmed');
      if (!options.deliverCode) {
        state.sequence++;
        if (state.lastRegistration) state.registered = true;
      }
      return json({ tx_response: { height: '12345', code: options.deliverCode ?? 0, raw_log: 'DeliverTx refused' } });
    }
    throw new Error(`Unexpected REST call: ${path}`);
  };
  return { state, client: new QorTransferClient(new Provider(), fetch) };
}

test('existing seed recovers a real signing key; migration preserves address and seed', () => {
  assert.equal(keypair.publicKey.length, 2592);
  const payload = new TextEncoder().encode('Zeni transfer test');
  assert.ok(pqcVerify(keypair.publicKey, payload, pqcSign(keypair.secretKey, payload)));
  const legacy = { ...account, pqcPublicKeyHash: ethers.keccak256(account.pqcSeedHex) };
  const repaired = repairPqcPublicKeyHash(legacy);
  assert.equal(repaired.classicalAddress, legacy.classicalAddress);
  assert.equal(repaired.pqcSeedHex, legacy.pqcSeedHex);
  assert.equal(repaired.pqcPublicKeyHash, ethers.keccak256(keypair.publicKey));
  assert.notEqual(repaired.pqcPublicKeyHash, legacy.pqcPublicKeyHash);
});

test('window budget rounds value plus gas up to uqor', () => {
  assert.equal(windowValueUqor(ethers.parseEther('1'), 21000n, 112500000000n), 1002363n);
  assert.equal(windowValueUqor(1n, 0n, 0n), 1n);
});

test('reads base and wrapped accounts without silently defaulting a nonce', () => {
  assert.deepEqual(parseAccountSequence({ account: { base_account: { account_number: '3', sequence: '7' } } }), { accountNumber: 3n, sequence: 7n });
  assert.throws(() => parseAccountSequence({ account: {} }), /Could not read/);
});

test('first send registers with proof, confirms window, then signs using the advanced nonce', async () => {
  const { client, state } = fixture();
  const quote = await client.prepare(account, recipient, '1');
  assert.equal(quote.registrationRequired, true);
  assert.equal(state.native.length, 0, 'review must not broadcast');
  await client.send(account, quote);
  assert.deepEqual(state.events, ['register', 'confirmed', 'window', 'confirmed', 'nonce', 'evm']);
  assert.equal(state.evm[0].nonce, 2);
  assert.equal(state.evm[0].value, ethers.parseEther('1'));
  assert.ok(state.native.every(tx => BigInt(tx.auth.fee.amount[0].amount) <= BigInt(quote.setupFeeCap)));
});

test('a matching registered key skips registration and its fee allowance', async () => {
  const { client, state } = fixture({ registered: true });
  const quote = await client.prepare(account, recipient, '1');
  assert.equal(quote.registrationRequired, false);
  assert.equal(quote.maxNetworkFee, '0.0923625');
  await client.send(account, quote);
  assert.deepEqual(state.events, ['window', 'confirmed', 'nonce', 'evm']);
});

for (const [name, options, pattern] of [
  ['mismatched key', { registered: true, mismatch: true }, /different or unreadable PQC key/],
  ['unproven key', { registered: true, possessionProven: false }, /proof of possession/],
  ['unknown registration status', { statusFailure: true }, /cannot tell/],
  ['insufficient setup balance', { balance: '1.01' }, /Insufficient QOR/],
  ['wrong chain', { chainId: '0x1' }, /not connected/],
  ['contract recipient', { code: '0x1234' }, /Contract recipients/],
]) {
  test(`rejects ${name} before any broadcast`, async () => {
    const { client, state } = fixture(options);
    await assert.rejects(client.prepare(account, recipient, '1'), pattern);
    assert.equal(state.native.length, 0); assert.equal(state.evm.length, 0);
  });
}

for (const [name, options, pattern] of [
  ['CheckTx rejection', { checkCode: 5 }, /CheckTx refused/],
  ['DeliverTx rejection', { deliverCode: 5 }, /DeliverTx refused/],
  ['gas above reviewed cap', { simulatedGas: '900000' }, /fee allowance/],
]) {
  test(`${name} prevents EVM submission`, async () => {
    const { client, state } = fixture(options);
    const quote = await client.prepare(account, recipient, '1');
    await assert.rejects(client.send(account, quote), pattern);
    assert.equal(state.evm.length, 0);
    assert.ok(!state.events.includes('window'));
  });
}

test('expired quote cannot spend', async () => {
  const { client, state } = fixture();
  const quote = await client.prepare(account, recipient, '1');
  await assert.rejects(client.send(account, { ...quote, expiresAt: 0 }), /expired/);
  assert.equal(state.native.length, 0);
});

test('locking during simulation prevents broadcast', async () => {
  let locked = false;
  const { client, state } = fixture({ onSimulate: () => { locked = true; } });
  const quote = await client.prepare(account, recipient, '1');
  await assert.rejects(client.send(account, quote, () => { if (locked) throw new Error('Wallet locked'); }), /Wallet locked/);
  assert.equal(state.native.length, 0);
});

test('MAX reserves registration and authorization fees using the current network price', async () => {
  const { client, state } = fixture();
  const quote = await client.prepare(account, recipient, 'MAX');
  assert.equal(ethers.parseEther(quote.amount) + ethers.parseEther(quote.maxNetworkFee), ethers.parseEther('10'));
  assert.equal(state.native.length, 0);
});


test('real EVM hash is persisted before a broadcast with an uncertain response', async () => {
  const { client, state } = fixture({ registered: true, evmFailure: true });
  const quote = await client.prepare(account, recipient, '1');
  const updates = [];
  let recordedHash;
  await assert.rejects(client.send(account, quote, () => {}, async (update) => updates.push(update), async (hash) => {
    assert.equal(state.evm.length, 0);
    assert.match(hash, /^0x[a-f0-9]{64}$/);
    recordedHash = hash;
  }), (error) => error.message.includes(recordedHash) && /status is unknown/.test(error.message));
  assert.ok(recordedHash);
  assert.deepEqual(updates.map((update) => update.status), ['PENDING', 'CONFIRMED']);
});

test('locking while saving activity prevents a later broadcast', async () => {
  const { client, state } = fixture({ registered: true });
  const quote = await client.prepare(account, recipient, '1');
  let locked = false;
  await assert.rejects(client.send(account, quote, () => {
    if (locked) throw new Error('Wallet locked');
  }, async () => { locked = true; }), /Wallet locked/);
  assert.equal(state.native.length, 0);
  assert.equal(state.evm.length, 0);
});

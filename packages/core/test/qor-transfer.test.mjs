import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ethers } from 'ethers';
import { qorechainTypes, verifyProofOfPossession, clearSignBytesCache, pqcSign, pqcVerify, hybridSignBytesV2 } from '@qorechain/sdk';
import { deriveAccountKeys, derivePqcKeypair, QorTransferClient, evmToBech32Address, NativeTxError, repairPqcPublicKeyHash, parseAccountSequence } from '../dist/index.js';
const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve('@qorechain/sdk'));
const { TxRaw, TxBody, AuthInfo } = sdkRequire('cosmjs-types/cosmos/tx/v1beta1/tx');
const { MsgSend } = sdkRequire('cosmjs-types/cosmos/bank/v1beta1/tx');
const account = deriveAccountKeys('test test test test test test test test test test test junk');
const recipient = '0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a';
const keypair = derivePqcKeypair(account);
function fixture(options = {}) {
  clearSignBytesCache();
  const state = { registered: options.registered ?? false, sequence: 0n, events: [], native: [], updates: [], balance: options.balance ?? '10000000' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const provider = {
    async getCode() { return options.code ?? '0x'; },
    async send(method) { assert.equal(method, 'eth_chainId', 'No EVM signing, nonce, balance, or broadcast path is allowed'); return options.chainId ?? '0x2648'; },
    async broadcastTransaction() { assert.fail('Must never send a classical EVM transaction'); },
  };
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/node_info')) return json({ default_node_info: { network: 'qorechain-diana' } });
    if (path.includes('/pqc/v1/account/')) {
      if (options.statusFailure) return json({ message: 'unavailable' }, 503);
      return json(state.registered ? { found: true, account: { public_key: ethers.encodeBase64(options.mismatch ? new Uint8Array(2592) : keypair.publicKey), possession_proven: options.possessionProven ?? true } } : { found: false });
    }
    if (path.endsWith('/by_denom')) return json({ balance: { denom: 'uqor', amount: state.balance } });
    if (path.endsWith('/feemarket/v1/params')) return json({ params: { min_gas_price: '100000000000' } });
    if (path.endsWith('/protocol_features')) return json({ features: [{ name: 'pqc-sign-bytes-v2', enabled: true, known: true }] });
    if (path.includes('/auth/v1beta1/accounts/')) return json({ account: { account_number: '15980', sequence: state.sequence.toString() } });
    if (path.endsWith('/simulate') || (path.endsWith('/txs') && init?.method === 'POST')) {
      const bytes = ethers.decodeBase64(JSON.parse(init.body).tx_bytes);
      const raw = TxRaw.decode(bytes), body = TxBody.decode(raw.bodyBytes), auth = AuthInfo.decode(raw.authInfoBytes);
      assert.equal(auth.signerInfos[0].sequence, state.sequence);
      const message = body.messages[0], registration = message.typeUrl.endsWith('MsgRegisterPQCKeyV2');
      if (registration) {
        const decoded = qorechainTypes.pqc.MsgRegisterPQCKeyV2.decode(message.value);
        assert.equal(body.extensionOptions.length, 0);
        assert.ok(verifyProofOfPossession({ chainId: 'qorechain-diana', account: account.cosmosAddress, publicKey: decoded.publicKey, proof: decoded.proofOfPossession }));
      } else {
        assert.ok(state.registered);
        assert.equal(message.typeUrl, '/cosmos.bank.v1beta1.MsgSend');
        const transfer = MsgSend.decode(message.value);
        assert.equal(transfer.fromAddress, account.cosmosAddress);
        assert.equal(transfer.toAddress, evmToBech32Address(recipient));
        assert.deepEqual(transfer.amount, [{ denom: 'uqor', amount: options.units ?? '1000000' }]);
        assert.equal(body.extensionOptions[0].typeUrl, '/qorechain.pqc.v1.PQCHybridSignature');
        const extension = qorechainTypes.pqcHybrid.PQCHybridSignature.decode(body.extensionOptions[0].value);
        const b0 = TxBody.encode({ ...body, extensionOptions: [] }).finish();
        assert.ok(pqcVerify(keypair.publicKey, hybridSignBytesV2('qorechain-diana', b0, raw.authInfoBytes), extension.pqcSignature), 'Verify the actual PQC signature on transfer bytes');
        const altered = TxBody.encode({ ...body, extensionOptions: [], messages: [{ typeUrl: message.typeUrl, value: MsgSend.encode({ ...transfer, toAddress: account.cosmosAddress }).finish() }] }).finish();
        assert.equal(pqcVerify(keypair.publicKey, hybridSignBytesV2('qorechain-diana', altered, raw.authInfoBytes), extension.pqcSignature), false, 'Recipient tampering must invalidate the PQC signature');
      }
      if (path.endsWith('/simulate')) { options.onSimulate?.(); return json({ gas_info: { gas_used: options.simulatedGas ?? '100000' } }); }
      const hash = ethers.sha256(bytes).slice(2).toUpperCase();
      assert.ok(state.updates.some(u => u.hash === hash && u.status === 'PENDING'));
      state.events.push(registration ? 'register' : 'transfer'); state.native.push({ registration, hash, auth });
      if (options.networkFailure) throw new Error('Network timeout');
      return json({ tx_response: { code: options.checkCode ?? 0, raw_log: 'CheckTx refused' } });
    }
    if (path.includes('/txs/')) {
      if (options.lookupFailure) return json({ message: 'unavailable' }, 503);
      state.events.push('confirmed');
      if (!options.deliverCode) { state.sequence++; if (state.native.at(-1).registration) state.registered = true; }
      return json({ tx_response: { height: '12345', code: options.deliverCode ?? 0, raw_log: 'DeliverTx refused' } });
    }
    throw new Error(`Unexpected REST call: ${path}`);
  };
  const observe = async update => { state.updates.push(update); };
  return { state, client: new QorTransferClient(provider, fetch), observe };
}
for (const registered of [false, true]) test(`native bank transfer has verified PQC signature (registered=${registered})`, async () => {
  const { client, state, observe } = fixture({ registered });
  const quote = await client.prepare(account, recipient, '1');
  assert.equal(quote.kind, 'native-qor');
  assert.equal(quote.maxNetworkFee, registered ? '0.09' : '0.18');
  assert.equal(state.native.length, 0);
  const hash = await client.send(account, quote, () => {}, observe, observe);
  assert.match(hash, /^[A-F0-9]{64}$/);
  assert.equal(hash, state.native.at(-1).hash);
  assert.deepEqual(state.events, registered ? ['transfer', 'confirmed'] : ['register', 'confirmed', 'transfer', 'confirmed']);
  assert.equal(state.updates.at(-1).status, 'CONFIRMED');
});
for (const [name, options, pattern] of [
  ['mismatched key', { registered: true, mismatch: true }, /different or unreadable PQC key/],
  ['unproven key', { registered: true, possessionProven: false }, /proof of possession/],
  ['unknown registration', { statusFailure: true }, /cannot tell/],
  ['insufficient spendable balance', { balance: '1010000' }, /Insufficient QOR/],
  ['wrong network', { chainId: '0x1' }, /not connected/],
  ['contract recipient', { code: '0x1234' }, /Contract recipients/],
]) test(`rejects ${name} before broadcast`, async () => {
  const { client, state } = fixture(options);
  await assert.rejects(client.prepare(account, recipient, '1'), pattern);
  assert.equal(state.native.length, 0);
});
test('six-decimal precision is exact; smaller amounts cannot silently round', async () => {
  const { client, state, observe } = fixture({ registered: true, units: '1' });
  for (const amount of ['0.0000001', '1.1234567', '0', '-1']) await assert.rejects(client.prepare(account, recipient, amount));
  const quote = await client.prepare(account, evmToBech32Address(recipient), '0.000001');
  assert.equal(quote.amountUqor, '1');
  await client.send(account, quote, () => {}, observe, observe);
  assert.equal(state.native.length, 1);
});
test('MAX leaves the full reviewed native fee reserve', async () => {
  const { client } = fixture();
  const quote = await client.prepare(account, recipient, 'MAX');
  assert.equal(ethers.parseUnits(quote.amount, 6) + ethers.parseUnits(quote.maxNetworkFee, 6), 10000000n);
});
for (const registered of [false, true]) for (const options of [{ checkCode: 5 }, { deliverCode: 5 }, { simulatedGas: '900000' }]) test(`chain/fee refusal cannot fall back to EVM (registered=${registered}): ${JSON.stringify(options)}`, async () => {
  const { client, state, observe } = fixture({ registered, ...options });
  const quote = await client.prepare(account, recipient, '1');
  await assert.rejects(client.send(account, quote, () => {}, observe, observe));
  assert.equal(state.updates.some(update => update.status === 'CONFIRMED'), false);
  if (!registered || options.simulatedGas) assert.equal(state.events.includes('transfer'), false);
});
for (const options of [{ networkFailure: true }, { lookupFailure: true }]) test(`uncertain transfer preserves the actual native hash: ${JSON.stringify(options)}`, async () => {
  const { client, state, observe } = fixture({ registered: true, ...options });
  const quote = await client.prepare(account, recipient, '1');
  await assert.rejects(client.send(account, quote, () => {}, observe, observe), e => e instanceof NativeTxError && e.update.hash === state.native[0].hash && e.update.status === 'PENDING');
  assert.deepEqual(state.updates.map(u => u.status), ['PENDING']);
});
test('expired or legacy EVM quotes cannot spend', async () => {
  const { client, state, observe } = fixture();
  const quote = await client.prepare(account, recipient, '1');
  for (const change of [{ expiresAt: 0 }, { kind: undefined }]) await assert.rejects(client.send(account, { ...quote, ...change }, () => {}, observe, observe));
  assert.equal(state.native.length, 0);
});
test('lock during simulation or activity persistence prevents broadcast', async () => {
  for (const phase of ['simulation', 'activity']) {
    let locked = false;
    const { client, state, observe } = fixture({ registered: true, onSimulate: () => { if (phase === 'simulation') locked = true; } });
    const quote = await client.prepare(account, recipient, '1');
    await assert.rejects(client.send(account, quote, () => { if (locked) throw new Error('Wallet locked'); }, observe, async update => { await observe(update); if (phase === 'activity') locked = true; }), /Wallet locked/);
    assert.equal(state.native.length, 0);
  }
});

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


test('reads base and wrapped accounts without silently defaulting a nonce', () => {
  assert.deepEqual(parseAccountSequence({ account: { base_account: { account_number: '3', sequence: '7' } } }), { accountNumber: 3n, sequence: 7n });
  assert.throws(() => parseAccountSequence({ account: {} }), /Could not read/);
});

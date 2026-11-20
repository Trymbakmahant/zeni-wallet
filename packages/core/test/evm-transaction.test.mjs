import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ethers } from 'ethers';
import { qorechainTypes, clearSignBytesCache, pqcVerify, hybridSignBytesV2 } from '@qorechain/sdk';
import { deriveAccountKeys, derivePqcKeypair, EvmTransactionClient, EvmBroadcastError, validateEvmRequest, validateEvmRead } from '../dist/index.js';
const require = createRequire(import.meta.url), sdkRequire = createRequire(require.resolve('@qorechain/sdk'));
const { TxRaw, TxBody, AuthInfo } = sdkRequire('cosmjs-types/cosmos/tx/v1beta1/tx');
const account = deriveAccountKeys('test test test test test test test test test test test junk');
const keypair = derivePqcKeypair(account);
const target = '0x2222222222222222222222222222222222222222';
const tx = { from: account.classicalAddress, to: target, data: '0xd0e30db0', value: '0x2386f26fc10000', chainId: '0x2648' };
const intent = fields => validateEvmRequest([{ ...tx, ...fields }], account.classicalAddress);

function fixture(options = {}) {
  clearSignBytesCache();
  const state = { registered: options.registered ?? true, sequence: 4n, setup: [], updates: [], evm: [], order: [], estimates: 0 };
  const reply = body => new Response(JSON.stringify(body));
  const provider = {
    async getFeeData() { return { gasPrice: 100_000_000_000n, maxFeePerGas: 200_000_000_000n, maxPriorityFeePerGas: 10_000_000_000n }; },
    async getBlock() { return { gasLimit: 30_000_000n, baseFeePerGas: 50_000_000_000n }; },
    async estimateGas() { state.estimates++; if (options.revert) throw Error('execution reverted'); return options.increase && state.estimates > 1 ? 200_000n : 50_000n; },
    async send(method, params) {
      state.order.push(method);
      if (method === 'eth_chainId') return options.wrongChain ? '0x1' : '0x2648';
      if (method === 'eth_getBalance') return ethers.toQuantity(ethers.parseEther(options.lowBalance ? '0.01' : '100'));
      if (method === 'eth_getTransactionCount') { assert.ok(state.setup.some(s => !s.registration)); return ethers.toQuantity(state.sequence); }
      if (method === 'eth_sendRawTransaction') {
        const signed = ethers.Transaction.from(params[0]);
        assert.equal(signed.from, account.classicalAddress); assert.equal(signed.chainId, 9800n);
        assert.equal(signed.nonce, Number(state.sequence), 'nonce follows all native setup');
        assert.equal(signed.to, options.deploy ? null : target); assert.equal(signed.data, options.deploy ? '0x60006000' : tx.data);
        assert.ok(state.updates.some(u => u.hash === signed.hash && u.status === 'PENDING'), 'persist before broadcast');
        state.evm.push(signed);
        if (options.broadcastTimeout) throw Error('timeout after acceptance');
        return signed.hash;
      }
      throw Error('Unexpected RPC: ' + method);
    },
  };
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/node_info')) return reply({ default_node_info: { network: 'qorechain-diana' } });
    if (path.includes('/pqc/v1/account/')) return reply(state.registered ? { found: true, account: { public_key: ethers.encodeBase64(keypair.publicKey), possession_proven: true } } : { found: false });
    if (path.endsWith('/by_denom')) return reply({ balance: { denom: 'uqor', amount: '100000000' } });
    if (path.endsWith('/feemarket/v1/params')) return reply({ params: { min_gas_price: '100000000000' } });
    if (path.endsWith('/protocol_features')) return reply({ features: [{ name: 'pqc-sign-bytes-v2', enabled: true, known: true }] });
    if (path.includes('/auth/v1beta1/accounts/')) return reply({ account: { account_number: '42', sequence: String(state.sequence) } });
    if (path.endsWith('/simulate') || (path.endsWith('/txs') && init?.method === 'POST')) {
      const bytes = ethers.decodeBase64(JSON.parse(init.body).tx_bytes);
      const raw = TxRaw.decode(bytes), body = TxBody.decode(raw.bodyBytes), auth = AuthInfo.decode(raw.authInfoBytes);
      assert.equal(auth.signerInfos[0].sequence, state.sequence);
      const message = body.messages[0], registration = message.typeUrl.endsWith('MsgRegisterPQCKeyV2');
      if (!registration) {
        assert.equal(message.typeUrl, '/qorechain.pqc.v1.MsgOpenEVMWindow');
        const window = qorechainTypes.pqc.MsgOpenEVMWindow.decode(message.value);
        assert.equal(String(window.maxTxs), '1'); assert.equal(String(window.blocks), '120');
        assert.deepEqual(window.allowedTargets, options.deploy ? [] : [target]);
        assert.equal(window.maxValue, options.dynamic ? '22000' : options.deploy ? '6000' : '16000');
        const extension = qorechainTypes.pqcHybrid.PQCHybridSignature.decode(body.extensionOptions[0].value);
        const unsigned = TxBody.encode({ ...body, extensionOptions: [] }).finish();
        assert.ok(pqcVerify(keypair.publicKey, hybridSignBytesV2('qorechain-diana', unsigned, raw.authInfoBytes), extension.pqcSignature));
      }
      if (path.endsWith('/simulate')) return reply({ gas_info: { gas_used: '100000' } });
      const hash = ethers.sha256(bytes).slice(2).toUpperCase();
      state.setup.push({ registration, hash }); state.order.push(registration ? 'register' : 'window');
      return reply({ tx_response: { code: options.setupRejected ? 5 : 0, raw_log: 'Setup rejected' } });
    }
    if (path.includes('/txs/')) {
      state.sequence++; state.registered = true;
      return reply({ tx_response: { height: '12345', code: 0 } });
    }
    throw Error('Unexpected REST: ' + path);
  };
  const client = new EvmTransactionClient(provider, fetch);
  const observe = async u => { state.updates.push(u); options.onUpdate?.(u); };
  return { client, state, observe };
}
for (const registered of [true, false]) test(`PQC window precedes nonce/signing and returns an actual EVM hash (registered=${registered})`, async () => {
  const { client, state, observe } = fixture({ registered });
  const quote = await client.prepare(account, intent());
  assert.equal(quote.registrationRequired, !registered); assert.equal(state.evm.length, 0);
  const hash = await client.send(account, quote, () => {}, observe, observe);
  assert.equal(hash, state.evm[0].hash); assert.equal(state.setup.length, registered ? 1 : 2);
  assert.ok(state.order.indexOf('window') < state.order.indexOf('eth_getTransactionCount'));
});
test('deployment uses reviewed bytecode and EIP-1559 fee caps remain exact', async () => {
  for (const options of [{ deploy: true }, { dynamic: true }]) {
    const { client, state, observe } = fixture(options);
    const request = intent(options.deploy ? { to: undefined, data: '0x60006000', value: '0x0' } : { type: '0x2' });
    const quote = await client.prepare(account, request);
    await client.send(account, quote, () => {}, observe, observe);
    assert.equal(state.evm[0].type, options.dynamic ? 2 : 0);
    if (options.dynamic) assert.equal(state.evm[0].maxFeePerGas, 200_000_000_000n);
  }
});
for (const [name, options] of [['wrong chain', { wrongChain: true }], ['revert', { revert: true }], ['insufficient balance', { lowBalance: true }]]) test(`${name} prevents review and broadcast`, async () => {
  const { client, state } = fixture(options);
  await assert.rejects(client.prepare(account, intent())); assert.equal(state.evm.length + state.setup.length, 0);
});
test('expired review, lock during setup, gas increase, and rejected setup cannot broadcast EVM', async () => {
  for (const reason of ['expired', 'lock', 'increase', 'setupRejected']) {
    let locked = false;
    const { client, state, observe } = fixture({ [reason]: true, onUpdate: () => { if (reason === 'lock') locked = true; } });
    const quote = await client.prepare(account, intent());
    if (reason === 'expired') quote.expiresAt = 0;
    await assert.rejects(client.send(account, quote, () => { if (locked) throw Error('locked'); }, observe, observe));
    assert.equal(state.evm.length, 0);
  }
});
test('uncertain broadcast retains the real hash and never retries automatically', async () => {
  const { client, state, observe } = fixture({ broadcastTimeout: true });
  const quote = await client.prepare(account, intent());
  await assert.rejects(client.send(account, quote, () => {}, observe, observe), e => e instanceof EvmBroadcastError && e.hash === state.evm[0].hash);
  assert.equal(state.evm.length, 1); assert.equal(state.updates.at(-1).status, 'PENDING');
});
test('malformed and unsupported fields fail before review', () => {
  for (const fields of [{ from: target }, { chainId: '0x1' }, { nonce: '0x0' }, { type: '0x4' }, { data: '0x1' }, { gas: '0x1' }, { gasPrice: '0x1', maxFeePerGas: '0x2' }, { accessList: [] }, { data: '0x12', input: '0x34' }, { data: '0x' + '11'.repeat(49153) }]) assert.throws(() => intent(fields));
});
test('read bridge cannot forward signing, RPC URLs, state overrides, or unbounded logs', () => {
  assert.deepEqual(validateEvmRead('eth_call', [{ to: target, data: '0x1234' }, 'latest']), [{ to: target, data: '0x1234' }, 'latest']);
  for (const [method, params] of [['eth_sendRawTransaction', ['0x12']], ['eth_call', [{ to: target }, 'latest', {}]], ['eth_getLogs', [{ address: target, fromBlock: '0x0', toBlock: '0xffffff' }]], ['eth_getBalance', ['https://evil.test', 'latest']]]) assert.throws(() => validateEvmRead(method, params));
});

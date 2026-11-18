import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256 } from 'ethers';
import { readPqcKeyStatus, PQC_KEY_STATUS_ABI, PQC_KEY_STATUS_ADDRESS } from '../dist/rpc/pqc-status.js';
const account = '0x2222222222222222222222222222222222222222';
const key = '0x' + '42'.repeat(2592);
function rpcMock({ registered = true, algorithm = 1, pubkey = key, chain = '0x2648', result, fail = false } = {}) {
  const calls = [];
  return { calls, fetch: async (_url, options) => {
    const req = JSON.parse(options.body); calls.push(req);
    const output = req.method === 'eth_chainId' ? chain : req.method === 'eth_blockNumber' ? '0x123'
      : result ?? PQC_KEY_STATUS_ABI.encodeFunctionResult('pqcKeyStatus', [registered, algorithm, pubkey]);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: output }), { status: fail ? 503 : 200 });
  } };
}
test('registered status binds account, local key, and fixed block', async () => {
  const mock = rpcMock();
  const result = await readPqcKeyStatus(account, keccak256(key), mock);
  assert.equal(result.matchesLocalKey, true);
  assert.equal(result.registered, true);
  assert.equal(result.blockNumber, '0x123');
  const request = mock.calls.at(-1);
  assert.equal(request.params[0].to, PQC_KEY_STATUS_ADDRESS);
  assert.equal(request.params[1], '0x123');
  assert.equal(PQC_KEY_STATUS_ABI.decodeFunctionData('pqcKeyStatus', request.params[0].data)[0], account);
});
test('unregistered account never presents a key match', async () => {
  const result = await readPqcKeyStatus(account, keccak256(key), rpcMock({ registered: false, algorithm: 0, pubkey: '0x' }));
  assert.equal(result.registered, false);
  assert.equal(result.publicKeyHash, null);
  assert.equal(result.matchesLocalKey, null);
});
test('different or unavailable local key is not presented as matching', async () => {
  assert.equal((await readPqcKeyStatus(account, '0x' + '00'.repeat(32), rpcMock())).matchesLocalKey, false);
  assert.equal((await readPqcKeyStatus(account, null, rpcMock())).matchesLocalKey, null);
});
for (const [name, config] of Object.entries({ wrongChain: { chain: '0x1' }, malformedKey: { pubkey: '0x42' }, wrongAlgorithm: { algorithm: 2 }, unavailablePrecompile: { result: '0x' }, networkError: { fail: true } })) {
  test(`fails closed: ${name}`, async () => { await assert.rejects(readPqcKeyStatus(account, null, rpcMock(config))); });
}
test('cancellation reaches the network transport', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readPqcKeyStatus(account, null, { signal: controller.signal, fetch: async (_url, options) => {
    options.signal.throwIfAborted(); throw new Error('Expected aborted signal');
  } }), { name: 'AbortError' });
});

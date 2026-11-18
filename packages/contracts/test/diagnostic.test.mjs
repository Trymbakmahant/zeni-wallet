import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { mldsa87 } from '@qorechain/pqc';
import { diagnose, abi, STATUS, VERIFY } from '../script/prove-features.mjs';
const account = '0x2222222222222222222222222222222222222222';
const keys = mldsa87.keygen(new Uint8Array(32).fill(7)); // Test fixture only.
function provider({ chain = '0x2648', registered = true, acceptEverything = false, rejectEverything = false } = {}) {
  return { send: async (method, params) => {
    if (method === 'eth_chainId') return chain;
    if (method === 'eth_blockNumber') return '0x123';
    assert.equal(method, 'eth_call', 'diagnostic must never broadcast');
    assert.equal(params[1], '0x123', 'all reads must use the same block');
    const { to, data } = params[0];
    if (to === STATUS) return abi.encodeFunctionResult('pqcKeyStatus', [registered, registered ? 1 : 0, registered ? keys.publicKey : '0x']);
    assert.equal(to, VERIFY);
    const [key, sig, msg] = abi.decodeFunctionData('pqcVerify', data);
    const valid = acceptEverything || (!rejectEverything && mldsa87.verify(ethers.getBytes(key), ethers.getBytes(msg), ethers.getBytes(sig)));
    return abi.encodeFunctionResult('pqcVerify', [valid]);
  } };
}
test('read-only diagnostic distinguishes registration from disposable signature check', async () => {
  const result = await diagnose(provider({ registered: false }), account);
  assert.equal(result.broadcast, false); assert.equal(result.registered, false);
  assert.equal(result.registeredSignature, 'not supplied');
});
test('wrong network aborts before any feature checks', async () => {
  await assert.rejects(diagnose(provider({ chain: '0x1' }), account), /chain ID/);
});
test('rejected valid signature fails diagnostic', async () => {
  await assert.rejects(diagnose(provider({ rejectEverything: true }), account), /rejected/);
});
test('accepted invalid signature fails diagnostic', async () => {
  await assert.rejects(diagnose(provider({ acceptEverything: true }), account), /altered/);
});
test('optional public proof must use account registered key', async () => {
  const message = new TextEncoder().encode('Public diagnostic message');
  const proof = { message: ethers.hexlify(message), signature: ethers.hexlify(mldsa87.sign(keys.secretKey, message)) };
  assert.match((await diagnose(provider(), account, proof)).registeredSignature, /^verified/);
  const other = mldsa87.keygen(new Uint8Array(32).fill(8));
  proof.signature = ethers.hexlify(mldsa87.sign(other.secretKey, message));
  await assert.rejects(diagnose(provider(), account, proof), /registered key/);
});
test('unregistered account cannot claim verified account signature', async () => {
  await assert.rejects(diagnose(provider({ registered: false }), account, {}), /without a registered key/);
});

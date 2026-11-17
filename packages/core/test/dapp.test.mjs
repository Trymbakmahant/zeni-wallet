import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDappRequest } from '../dist/index.js';
const account = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const recipient = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

test('dApp QOR intent preserves recipient and integer wei amount', () => {
  assert.deepEqual(validateDappRequest('eth_sendTransaction', [{ from: account, to: recipient, value: '0x1', chainId: '0x2648' }], account), { kind: 'transfer', to: recipient, amount: '0.000000000000000001' });
});
for (const [name, override] of [
  ['wrong sender', { from: recipient }], ['wrong chain', { chainId: '0x1' }], ['contract data', { data: '0x1234' }],
  ['nonce override', { nonce: '0x0' }], ['gas override', { gas: '0x5208' }], ['zero value', { value: '0x0' }],
  ['negative value', { value: '-1' }], ['zero recipient', { to: '0x0000000000000000000000000000000000000000' }],
]) test(`rejects ${name} before a quote/signature`, () => {
  assert.throws(() => validateDappRequest('eth_sendTransaction', [{ from: account, to: recipient, value: '0x1', ...override }], account));
});
test('message signing rejects binary, hidden controls, wrong signer and excessive messages', () => {
  assert.equal(validateDappRequest('personal_sign', ['0x6869', account], account).text, 'hi');
  for (const params of [['0xff', account], ['0x686900', account], ['0x6869', recipient], ['0x' + '61'.repeat(4097), account]]) {
    assert.throws(() => validateDappRequest('personal_sign', params, account));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDappRequest, bech32ToEvmAddress } from '../dist/index.js';
import { getAddress } from 'ethers';
import { bech32 } from '@scure/base';
const account = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const recipient = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

test('dApp QOR intent preserves recipient and integer wei amount', () => {
  assert.deepEqual(validateDappRequest('zeni_sendQor', [{ from: account, to: recipient, value: '0xe8d4a51000', chainId: '0x2648' }], account), { kind: 'transfer', to: recipient, amount: '0.000001' });
});
test('Connect accepts the reported QOR recipient and preserves its 20-byte destination', () => {
  const qor = 'qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp';
  const tx = { from: account, to: ` ${qor} `, value: '0xde0b6b3a7640000', chainId: '0x2648' };
  assert.deepEqual(validateDappRequest('zeni_sendQor', [tx], account), {
    kind: 'transfer', to: getAddress(bech32ToEvmAddress(qor)), amount: '1.0',
  });
});
test('Connect rejects corrupt checksums, foreign prefixes, wrong lengths, and zero QOR addresses', () => {
  const encode = (prefix, bytes) => bech32.encode(prefix, bech32.toWords(bytes));
  for (const to of [
    'qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dq',
    encode('cosmos', new Uint8Array(20).fill(1)),
    encode('qor', new Uint8Array(32).fill(1)),
    encode('qor', new Uint8Array(20)),
    'qor1FF44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp',
  ]) assert.throws(() => validateDappRequest('zeni_sendQor', [{ from: account, to, value: '0xe8d4a51000' }], account));
});
for (const [name, override] of [
  ['wrong sender', { from: recipient }], ['wrong chain', { chainId: '0x1' }], ['contract data', { data: '0x1234' }],
  ['nonce override', { nonce: '0x0' }], ['gas override', { gas: '0x5208' }], ['zero value', { value: '0x0' }],
  ['negative value', { value: '-1' }], ['zero recipient', { to: '0x0000000000000000000000000000000000000000' }],
]) test(`rejects ${name} before a quote/signature`, () => {
  assert.throws(() => validateDappRequest('zeni_sendQor', [{ from: account, to: recipient, value: '0xe8d4a51000', ...override }], account));
});
test('message signing rejects binary, hidden controls, wrong signer and excessive messages', () => {
  assert.equal(validateDappRequest('personal_sign', ['0x6869', account], account).text, 'hi');
  for (const params of [['0xff', account], ['0x686900', account], ['0x6869', recipient], ['0x' + '61'.repeat(4097), account]]) {
    assert.throws(() => validateDappRequest('personal_sign', params, account));
  }
});

test('rejects sub-uqor amounts without rounding and refuses the classical EVM method', () => {
  assert.throws(() => validateDappRequest('zeni_sendQor', [{ from: account, to: recipient, value: '0x1' }], account), /6 decimal/);
  assert.throws(() => validateDappRequest('eth_sendTransaction', [{ from: account, to: recipient, value: '0xde0b6b3a7640000' }], account), /EVM sends are disabled/);
});

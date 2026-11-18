import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAccountKeys, derivePqcKeypair } from '../dist/index.js';
// Public BIP-39 fixture. Never funded or used outside tests.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
test('sequential accounts have distinct classical/PQC identities and restore from the same phrase', () => {
  const accounts = [0, 1, 2].map(index => deriveAccountKeys(mnemonic, '', index));
  for (const field of ['classicalAddress', 'cosmosAddress', 'pqcPublicKeyHash', 'pqcSeedHex']) {
    assert.equal(new Set(accounts.map(account => account[field])).size, 3);
  }
  for (let index = 0; index < 3; index++) {
    assert.deepEqual(deriveAccountKeys(mnemonic, '', index), accounts[index]);
    assert.equal(derivePqcKeypair(accounts[index]).publicKey.length, 2592);
  }
  assert.deepEqual(deriveAccountKeys(mnemonic), accounts[0]);
});
test('invalid derivation indices cannot change the intended derivation path', () => {
  for (const index of [-1, 0.5, NaN, Infinity, '1', 2147483648]) {
    assert.throws(() => deriveAccountKeys(mnemonic, '', index), /index/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { encryptVault, decryptVault, deriveVaultKey } from '../dist/index.js';

test('WebCrypto KDF remains compatible with existing PBKDF2-SHA256 vaults', async () => {
  const salt = new Uint8Array(32).fill(7);
  assert.deepEqual(Buffer.from(await deriveVaultKey('wallet password', salt)), pbkdf2Sync('wallet password', salt, 600000, 32, 'sha256'));
});

test('vault authenticates passwords and ciphertext; repeated encryption uses fresh randomness', async () => {
  const data = { mnemonic: 'test secret payload' };
  const a = await encryptVault(data, 'wallet password');
  const b = await encryptVault(data, 'wallet password');
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.cipher.iv, b.cipher.iv);
  assert.deepEqual(await decryptVault(a, 'wallet password'), data);
  await assert.rejects(decryptVault(a, 'wrong password'));
  const tampered = structuredClone(a);
  tampered.cipher.ciphertext = (a.cipher.ciphertext.startsWith('00') ? '01' : '00') + a.cipher.ciphertext.slice(2);
  await assert.rejects(decryptVault(tampered, 'wallet password'));
  for (const modify of [
    (x) => { x.version = 2; },
    (x) => { x.kdf.iterations = 1; },
    (x) => { x.kdf.iterations = 1e12; },
    (x) => { x.cipher.iv = 'zz'.repeat(12); },
    (x) => { x.cipher.authTag = '00'; },
  ]) {
    const invalid = structuredClone(a); modify(invalid);
    await assert.rejects(decryptVault(invalid, 'wallet password'));
  }
});

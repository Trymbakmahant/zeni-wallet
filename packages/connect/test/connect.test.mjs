import test from 'node:test';
import assert from 'node:assert/strict';
import { ZeniProvider, ZeniWalletSession, ZeniError } from '../dist/index.js';
import { secret, seal, open, parsePairing } from '@zeni-wallet/connect-protocol';
import { createRelay } from '../../../apps/relay/src/server.mjs';
import { Wallet, hexlify, toUtf8Bytes, verifyMessage } from 'ethers';
import { validateDappRequest } from '@zeni/core';

async function fixture(t) {
  const server = createRelay({ allowedOrigins: ['https://app.example'], rateLimit: 10000 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const originFetch = (url, options = {}) => fetch(url, { ...options, headers: { ...options.headers, Origin: 'https://app.example' } });
  const provider = new ZeniProvider({ name: 'Example App', relayUrl: `http://127.0.0.1:${server.address().port}`, fetch: originFetch, pollIntervalMs: 10 });
  t.after(async () => { await provider.disconnect(); server.closeAllConnections(); server.close(); });
  return provider;
}

test('AES-GCM rejects wrong key, altered ciphertext, reflected direction and cross-session replay', async () => {
  const key = secret(), session = 'a'.repeat(32), message = { type: 'disconnect' };
  const frame = await seal(key, session, 'dapp', message);
  assert.deepEqual(await open(key, session, 'dapp', frame), message);
  await assert.rejects(open(secret(), session, 'dapp', frame));
  await assert.rejects(open(key, session, 'wallet', frame));
  await assert.rejects(open(key, 'b'.repeat(32), 'dapp', frame));
  await assert.rejects(open(key, session, 'dapp', { ...frame, id: crypto.randomUUID() }));
  await assert.rejects(open(key, session, 'dapp', { ...frame, ciphertext: (frame.ciphertext[0] === 'A' ? 'B' : 'A') + frame.ciphertext.slice(1) }));
  assert.throws(() => parsePairing('zeni://connect#v=1&relay=http://evil.example&session=abc'));
});

test('QR pairing completes a real encrypted message-signing round trip; signature recovers account', async t => {
  const provider = await fixture(t), wallet = Wallet.createRandom();
  let peer, approvals = 0;
  const pairing = new Promise((resolve, reject) => provider.on('display_uri', uri => {
    ZeniWalletSession.pair(uri, { pollIntervalMs: 10 }).then(async session => {
      peer = session;
      assert.equal(session.info.origin, 'https://app.example');
      await session.approve(wallet.address, async request => {
        approvals++;
        const intent = validateDappRequest(request.method, request.params, wallet.address);
        assert.equal(intent.kind, 'message');
        return wallet.signMessage(toUtf8Bytes(intent.text));
      });
      resolve();
    }).catch(reject);
  }));
  t.after(() => peer?.disconnect().catch(() => {}));
  assert.deepEqual(await provider.connect(), [wallet.address]); await pairing;
  const text = 'Sign in to Example App: nonce 12345';
  const signature = await provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(text)), wallet.address] });
  assert.equal(verifyMessage(text, signature), wallet.address);
  assert.equal(approvals, 1);
  await assert.rejects(provider.request({ method: 'eth_sign', params: [] }), error => error.code === 4200);
  await provider.disconnect();
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), []);
});

test('wallet rejection is returned with error 4001 and does not connect', async t => {
  const provider = await fixture(t);
  const pairing = new Promise((resolve, reject) => provider.on('display_uri', uri => {
    ZeniWalletSession.pair(uri).then(session => session.reject()).then(resolve, reject);
  }));
  await assert.rejects(provider.connect(), error => error.code === 4001);
  await pairing;
  assert.equal(provider.connected, false);
});

test('rejected signing request returns the wallet error without a signature', async t => {
  const provider = await fixture(t), wallet = Wallet.createRandom();
  let peer;
  const pairing = new Promise((resolve, reject) => provider.on('display_uri', uri => {
    ZeniWalletSession.pair(uri, { pollIntervalMs: 10 }).then(async session => {
      peer = session;
      await session.approve(wallet.address, async () => { throw new ZeniError(4001, 'User rejected request'); }); resolve();
    }).catch(reject);
  }));
  t.after(() => peer?.disconnect().catch(() => {}));
  await provider.connect(); await pairing;
  await assert.rejects(provider.request({ method: 'personal_sign', params: ['0x6869', wallet.address] }), error => error.code === 4001);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../src/server.mjs';
import { randomBytes } from 'node:crypto';

async function fixture(t, options = {}) {
  const server = createRelay({ allowedOrigins: ['https://app.example'], ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const api = (path, method = 'GET', body, token, origin = 'https://app.example') => fetch(url + path, {
    method, headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const create = async () => (await api('/v1/sessions', 'POST', { name: 'Example' })).json();
  return { api, create };
}

test('creation requires an allowed Origin; session credentials enforce role separation', async t => {
  const { api, create } = await fixture(t);
  assert.equal((await api('/v1/sessions', 'POST', { name: 'Bad' }, undefined, 'https://evil.example')).status, 403);
  assert.equal((await api('/v1/sessions', 'POST', { name: 'Bad' }, undefined, null)).status, 403);
  const session = await create(), path = `/v1/sessions/${session.id}`;
  assert.equal((await api(path)).status, 401);
  assert.equal((await api(path, 'GET', undefined, randomBytes(32).toString('base64url'))).status, 401);
  assert.equal((await api(path + '/activate', 'POST', undefined, session.dappToken)).status, 403);
  assert.equal((await api(path, 'GET', undefined, session.dappToken, 'https://evil.example')).status, 403);
  const info = await (await api(path, 'GET', undefined, session.walletToken)).json();
  assert.equal(info.origin, 'https://app.example');
  assert.equal(info.dappToken, undefined);
});

test('encrypted mailbox enforces approval, deduplicates retries, and expires sessions', async t => {
  let now = 1000;
  const { api, create } = await fixture(t, { now: () => now });
  const s = await create(), path = `/v1/sessions/${s.id}`;
  const frame = { id: crypto.randomUUID(), iv: randomBytes(12).toString('base64url'), ciphertext: randomBytes(64).toString('base64url') };
  assert.equal((await api(path + '/messages', 'POST', frame, s.dappToken)).status, 409);
  const activation = await api(path + '/activate', 'POST', undefined, s.walletToken);
  assert.equal(activation.status, 200);
  const newToken = (await activation.json()).walletToken;
  assert.equal((await api(path, 'GET', undefined, s.walletToken)).status, 401, 'QR credential is revoked after approval');
  s.walletToken = newToken;
  assert.equal((await api(path + '/messages', 'POST', frame, s.dappToken)).status, 200);
  assert.equal((await api(path + '/messages', 'POST', frame, s.dappToken)).status, 200);
  const received = await (await api(path + '/messages', 'GET', undefined, s.walletToken)).json();
  assert.equal(received.messages.length, 1);
  assert.deepEqual(received.messages[0].frame, frame);
  assert.equal((await (await api(path + '/messages?after=1', 'GET', undefined, s.walletToken)).json()).messages.length, 0);
  now += 3600001;
  assert.equal((await api(path, 'GET', undefined, s.walletToken)).status, 410);
});

test('rejects malformed frames, bounded queues, and revoked sessions', async t => {
  const { api, create } = await fixture(t);
  const s = await create(), path = `/v1/sessions/${s.id}`;
  assert.equal((await api(path + '/messages', 'POST', { id: 'bad' }, s.walletToken)).status, 400);
  for (let i = 0; i < 32; i++) {
    const frame = { id: crypto.randomUUID(), iv: randomBytes(12).toString('base64url'), ciphertext: randomBytes(32).toString('base64url') };
    assert.equal((await api(path + '/messages', 'POST', frame, s.walletToken)).status, 200);
  }
  assert.equal((await api(path + '/messages', 'POST', { id: crypto.randomUUID(), iv: randomBytes(12).toString('base64url'), ciphertext: randomBytes(32).toString('base64url') }, s.walletToken)).status, 429);
  assert.equal((await api(path, 'DELETE', undefined, s.dappToken)).status, 200);
  assert.equal((await api(path, 'GET', undefined, s.walletToken)).status, 410);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  validateSessionGrant, parseSessionExecution, SessionClient,
} from '../dist/index.js';

const CONFIG = { enabled: true, maxSessionKeys: 10, maxSpendingRules: 5, defaultSessionTtlSeconds: 86400 };
const agentWallet = ethers.Wallet.createRandom();
const pubkey = ethers.getBytes(ethers.SigningKey.computePublicKey(agentWallet.privateKey, true));
const inAnHour = Math.floor(Date.now() / 1000) + 3600;

const grant = (overrides = {}) => ({
  pubkey, possessionProof: new Uint8Array(64).fill(1), scheme: 'secp256k1',
  label: 'Trading bot', expiryUnix: inAnHour, permissions: ['send'],
  rule: { perTxLimit: '50000', dailyLimit: '200000', allowedDenoms: ['uqor'] },
  ...overrides,
});

test('valid session grant passes', () => {
  assert.doesNotThrow(() => validateSessionGrant(grant(), CONFIG));
});

test('grant validation rejects bad labels, proofs and permissions', () => {
  assert.throws(() => validateSessionGrant(grant({ label: '  ' }), CONFIG), /label/i);
  assert.throws(() => validateSessionGrant(grant({ label: 'x'.repeat(65) }), CONFIG), /label/i);
  assert.throws(() => validateSessionGrant(grant({ possessionProof: new Uint8Array(0) }), CONFIG), /possession/i);
  assert.throws(() => validateSessionGrant(grant({ permissions: [] }), CONFIG), /permission/i);
  assert.throws(() => validateSessionGrant(grant({ permissions: ['deploy'] }), CONFIG), /permission/i);
});

test('evm permission + contract allowlist validate together', () => {
  const evmGrant = (allow) => grant({
    permissions: ['send', 'evm'],
    rule: { perTxLimit: '50000', dailyLimit: '200000', allowedDenoms: ['uqor'], allowedEvmCalls: allow },
  });
  const addr = '0x' + 'ab'.repeat(20);
  assert.doesNotThrow(() => validateSessionGrant(evmGrant([addr]), CONFIG));
  assert.doesNotThrow(() => validateSessionGrant(evmGrant([`${addr}/0x1234abcd`]), CONFIG));
  assert.doesNotThrow(() => validateSessionGrant(grant({ permissions: ['evm'] }), CONFIG));
  assert.throws(() => validateSessionGrant(evmGrant(['qor1xyz']), CONFIG), /allowlist/i);
  assert.throws(() => validateSessionGrant(evmGrant([`${addr}/0x123`]), CONFIG), /allowlist/i);
  assert.throws(
    () => validateSessionGrant(grant({ rule: { perTxLimit: '50000', dailyLimit: '200000', allowedDenoms: ['uqor'], allowedEvmCalls: [addr] } }), CONFIG),
    /evm permission/i,
  );
});

test('grant validation enforces expiry bounds', () => {
  const now = Math.floor(Date.now() / 1000);
  assert.throws(() => validateSessionGrant(grant({ expiryUnix: now - 10 }), CONFIG), /expire/i);
  assert.throws(() => validateSessionGrant(grant({ expiryUnix: now + 30 }), CONFIG), /expire/i);
  assert.throws(() => validateSessionGrant(grant({ expiryUnix: now + 86400 * 30 }), CONFIG), /future/i);
});

test('grant validation enforces bounding limits', () => {
  assert.throws(() => validateSessionGrant(grant({ rule: { perTxLimit: '0', dailyLimit: '0', allowedDenoms: [] } }), CONFIG), /limit/i);
  assert.throws(() => validateSessionGrant(grant({ rule: { perTxLimit: '300000', dailyLimit: '200000', allowedDenoms: ['uqor'] } }), CONFIG), /per-transaction/i);
  assert.throws(() => validateSessionGrant(grant({ rule: { perTxLimit: 'abc', dailyLimit: '200000', allowedDenoms: ['uqor'] } }), CONFIG), /base-unit/i);
});

test('parseSessionExecution: non-zero tx code is failure', () => {
  const r = parseSessionExecution({ code: 5, raw_log: 'spending limit exceeded' });
  assert.equal(r.ok, false);
  assert.match(r.failures[0].error, /spending limit/);
});

test('parseSessionExecution: code 0 with execution_failed event is failure', () => {
  const receipt = {
    code: 0,
    events: [{ type: 'abstractaccount_execution_failed', attributes: [
      { key: 'reason', value: 'spending limit' }, { key: 'index', value: '0' },
    ] }],
    msg_responses: [],
  };
  const r = parseSessionExecution(receipt);
  assert.equal(r.ok, false);
  assert.ok(r.failures.length >= 1);
});

test('parseSessionExecution: clean receipt is success', () => {
  assert.equal(parseSessionExecution({ code: 0, events: [], msg_responses: [] }).ok, true);
  assert.equal(parseSessionExecution(null).ok, false);
});

test('execution builders produce a deterministic digest and relay message', () => {
  const client = new SessionClient(new ethers.JsonRpcProvider('http://localhost:1'));
  const account = 'qor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a';
  const to = 'qor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a';
  const d1 = client.buildCosmosAuthDigest({ account, pubkey, to, amount: '10000uqor', nonce: 0n });
  const d2 = client.buildCosmosAuthDigest({ account, pubkey, to, amount: '10000uqor', nonce: 0n });
  assert.equal(d1.length, 32);
  assert.deepEqual(d1, d2);
  // Different nonce -> different digest (replay binding).
  const d3 = client.buildCosmosAuthDigest({ account, pubkey, to, amount: '10000uqor', nonce: 1n });
  assert.notDeepEqual(d1, d3);
  const msg = client.buildSessionExecution({
    relayer: account, account, scheme: 'secp256k1', pubkey,
    signature: new Uint8Array(64), to, amount: '10000uqor', nonce: 0n,
  });
  assert.match(msg.typeUrl, /MsgExecuteCosmos/);
});

test('EVM-lane relay message builds and enforces the chain gas cap', () => {
  const client = new SessionClient(new ethers.JsonRpcProvider('http://localhost:1'));
  const account = 'qor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a';
  const contract = '0x' + 'cd'.repeat(20);
  const msg = client.buildSessionEvmExecution({
    relayer: account, account, scheme: 'secp256k1', pubkey,
    signature: new Uint8Array(64), to: contract, value: '1000000000000',
    data: new Uint8Array([1, 2, 3]), gasLimit: 700000n, nonce: 0n,
  });
  assert.match(msg.typeUrl, /MsgExecuteEVM/);
  assert.throws(
    () => client.buildSessionEvmExecution({
      relayer: account, account, scheme: 'secp256k1', pubkey,
      signature: new Uint8Array(64), to: contract, gasLimit: 40_000_000n, nonce: 0n,
    }),
    /gas/i,
  );
});

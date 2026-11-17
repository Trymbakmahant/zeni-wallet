import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTransactionExplorerUrl } from '../dist/rpc/explorer.js';
import { transactionExplorerUrl } from '../dist/account/constants.js';
const evm = '0x6fcf2a7f9976356180f48fe0c732f8276c60aed25933c4fcc8ea3a65ae920499';
const cosmos = '7FFFE290EC5253D91DD3691605632F798D9D5CCBF8342967DC518E73B94DD237';
const receipt = (hash = cosmos, match = evm) => ({ txhash: hash, events: [{ type: 'ethereum_tx', attributes: [{ key: 'ethereumTxHash', value: match }] }] });
const response = tx_responses => ({ ok: true, json: async () => ({ tx_responses }) });

test('native explorer links need no lookup; raw EVM hashes cannot be used as Cosmos IDs', async () => {
  assert.equal(await resolveTransactionExplorerUrl(cosmos, () => { throw new Error('Unexpected network call'); }), `https://explore.qore.network/tx/${cosmos}`);
  assert.throws(() => transactionExplorerUrl(evm), /Invalid/);
});
test('EVM hash resolves to a different, event-matched Cosmos transaction ID', async () => {
  const url = await resolveTransactionExplorerUrl(evm, async (input, options) => {
    const request = new URL(input);
    assert.equal(request.origin, 'https://api-testnet.qore.host');
    assert.equal(request.searchParams.get('query'), `ethereum_tx.ethereumTxHash='${evm}'`);
    assert.equal(options.credentials, 'omit');
    return response([receipt()]);
  });
  assert.equal(url, `https://explore.qore.network/tx/${cosmos}`);
  assert.equal(url.includes(evm.slice(2)), false);
});
test('unindexed, unrelated, or malformed mappings never invent a link', async () => {
  for (const entries of [[], [receipt(cosmos, '0x' + '11'.repeat(32))], [receipt('https://evil.example')], [{ txhash: cosmos }]]) {
    assert.equal(await resolveTransactionExplorerUrl(evm, async () => response(entries)), null);
  }
});
test('lookup errors and invalid hashes can be retried without an incorrect URL', async () => {
  await assert.rejects(resolveTransactionExplorerUrl('0xinvalid'), /Invalid/);
  await assert.rejects(resolveTransactionExplorerUrl(evm, async () => ({ ok: false })), /unavailable/);
  await assert.rejects(resolveTransactionExplorerUrl(evm, async () => ({ ok: true, json: async () => ({}) })), /Invalid/);
  await assert.rejects(resolveTransactionExplorerUrl(evm, async () => { throw new Error('offline'); }), /offline/);
});

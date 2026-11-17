import { QORECHAIN_CONFIG, transactionExplorerUrl } from '../account/constants.js';

/** EVM keccak hashes and Cosmos SHA-256 transaction IDs identify different envelopes.
 * Resolve the indexed ethereum_tx event instead of removing the EVM hash's 0x prefix.
 * null means the transaction has not been indexed yet; never invent an explorer ID.
 */
export async function resolveTransactionExplorerUrl(hash: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<string | null> {
  if (!/^(0x)?[a-fA-F0-9]{64}$/.test(hash)) throw new Error('Invalid transaction hash.');
  if (!hash.startsWith('0x')) return transactionExplorerUrl(hash);
  const query = new URLSearchParams({ query: `ethereum_tx.ethereumTxHash='${hash.toLowerCase()}'`, limit: '10' });
  const response = await fetchImpl(`${QORECHAIN_CONFIG.restUrl}/cosmos/tx/v1beta1/txs?${query}`, {
    signal: AbortSignal.timeout(10_000), credentials: 'omit', redirect: 'error',
  });
  if (!response.ok) throw new Error('Explorer lookup is unavailable. Try again shortly.');
  const data = await response.json();
  if (!Array.isArray(data.tx_responses)) throw new Error('Invalid explorer lookup response.');
  for (const tx of data.tx_responses) {
    const matches = Array.isArray(tx.events) && tx.events.some((event: any) => event.type === 'ethereum_tx'
      && Array.isArray(event.attributes) && event.attributes.some((a: any) => a.key === 'ethereumTxHash'
        && typeof a.value === 'string' && a.value.toLowerCase() === hash.toLowerCase()));
    if (matches && typeof tx.txhash === 'string' && /^[a-fA-F0-9]{64}$/.test(tx.txhash)) return transactionExplorerUrl(tx.txhash.toUpperCase());
  }
  return null;
}

import { validateDappRequest } from '../../../packages/core/src/account/dapp';
import { ethers } from 'ethers';
import { clearPqcStatusCache, fetchPqcStatus, isRegisteredPqcKey } from '@qorechain/sdk';
import { bech32ToEvmAddress, deriveAccountKeys, derivePqcKeypair, generateNewMnemonic, isValidMnemonic, normalizeMnemonic } from '../../../packages/core/src/crypto/derivation';
import { AmmSwapClient, swapReceivedAmount } from '../../../packages/core/src/rpc/amm';
import { QorTransferClient } from '../../../packages/core/src/rpc/qor-transfer';
import { NativeTxError } from '../../../packages/core/src/rpc/native-transaction';
import { QORECHAIN_CONFIG, transactionExplorerUrl } from '../../../packages/core/src/account/constants';

const native = (kind: string, payload: unknown) => (window as any).webkit.messageHandlers.wallet.postMessage({ kind, payload: JSON.parse(JSON.stringify(payload)) });
// All networking goes through the native allowlist; WebKit has no network access.
globalThis.fetch = async (input: any, options: any = {}) => {
  const request = new Request(input, options);
  if (request.signal.aborted) throw new Error('Request cancelled.');
  const body = request.method === 'GET' ? undefined : await request.text();
  const result = await native('request', { url: request.url, method: request.method, body });
  if (request.signal.aborted) throw new Error('Request cancelled.');
  return new Response(result.body, { status: result.status, headers: { 'content-type': 'application/json' } });
};
if (!crypto.randomUUID) (crypto as any).randomUUID = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

let account: ReturnType<typeof deriveAccountKeys> | null = null;
type PublicAccount = {
  classicalAddress: string;
  cosmosAddress: string;
  pqcPublicKeyHex: string;
  pqcPublicKeyHash: string;
};
let publicAccount: PublicAccount | null = null;
let epoch = 0;
let busy = false;
let history: any[] = [];
const quotes = new Map<string, { kind: string; quote: any }>();
let transferContext: any = null;
const messageReviews = new Map<string, { hex: string; expiresAt: number }>();

function errorMessage(error: any): string {
  if (error instanceof NativeTxError) return error.message;
  return error?.info?.error?.message || error?.reason || error?.shortMessage || error?.message || 'QoreChain request failed.';
}
async function record(item: any) {
  const previous = history.find(entry => entry.hash === item.hash);
  const next = { ...previous, ...item, timestamp: previous?.timestamp || Date.now() };
  // Persist before broadcasting. Retain every unresolved transaction, even when history is long.
  const others = history.filter(entry => entry.hash !== item.hash);
  history = [next, ...others.filter(entry => entry.status === 'PENDING'), ...others.filter(entry => entry.status !== 'PENDING').slice(0, 100)];
  await native('activity', history);
}
class ObservedProvider extends ethers.JsonRpcProvider {
  override async broadcastTransaction(signedTx: string) {
    if (!transferContext) throw new Error('No reviewed transfer.');
    const item = { ...transferContext, hash: ethers.keccak256(signedTx), nativeChain: false, stage: 'transfer', status: 'PENDING' };
    await record(item);
    try { return await super.broadcastTransaction(signedTx); }
    catch { throw new Error(`Transfer broadcast is unconfirmed. Check Activity before retrying. Transaction: ${item.hash}`); }
  }
}
const provider = new ObservedProvider(QORECHAIN_CONFIG.rpcUrls[0], undefined, { batchMaxCount: 1, cacheTimeout: -1 });
const swaps = new AmmSwapClient(provider);
// Quote preparation needs public key registration status, never a private signing key.
async function publicStatus(active: PublicAccount) {
  clearPqcStatusCache();
  const status = await fetchPqcStatus({ rest: QORECHAIN_CONFIG.restUrl, address: active.cosmosAddress, fetch: globalThis.fetch });
  if (status.registered) {
    if (isRegisteredPqcKey(status, ethers.getBytes(active.pqcPublicKeyHex)) !== true) {
      throw new Error('This account has a different or unreadable PQC key registered. Restore the original wallet before sending.');
    }
    if (status.possessionProven === false) throw new Error('The registered PQC key needs proof-of-possession migration before sending.');
  }
  return status;
}
class PublicSwapQuotes extends AmmSwapClient {
  protected override status(active: any) { return publicStatus(active); }
}
class PublicTransferQuotes extends QorTransferClient {
  protected override status(active: any) { return publicStatus(active); }
}
const swapQuotes = new PublicSwapQuotes(provider);
const transferQuotes = new PublicTransferQuotes(provider);
function watching(): PublicAccount {
  if (!publicAccount) throw new Error('Import a wallet before viewing balances.');
  return publicAccount;
}
function samePublicAccount(a: PublicAccount | null, b: PublicAccount): boolean {
  return a?.classicalAddress === b.classicalAddress && a.cosmosAddress === b.cosmosAddress
    && a.pqcPublicKeyHex === b.pqcPublicKeyHex && a.pqcPublicKeyHash === b.pqcPublicKeyHash;
}
class ObservedTransfer extends QorTransferClient {
  protected override async broadcastNative(active: any, message: any, classical: boolean, quote: any, check: () => void) {
    return super.broadcastNative(active, message, classical, quote, check, async update => {
      await record({ ...transferContext, hash: update.hash, nativeChain: true, stage: classical ? 'registration' : 'authorization', status: update.status, gasCost: `${ethers.formatUnits(update.feeUqor, 6)} QOR`, error: update.error });
    });
  }
}
const transfers = new ObservedTransfer(provider);
function unlocked() {
  if (!account) throw new Error('Unlock your wallet to continue.');
  return account;
}
function checkSession(active: any, version: number) {
  if (account !== active || version !== epoch) throw new Error('Wallet locked or account changed. Review again.');
}
async function reconcile() {
  for (const item of [...history].filter(i => i.status === 'PENDING')) {
    try {
      if (item.nativeChain) {
        const receipt = await swaps.receipt(item.hash);
        if (!receipt || receipt.code === undefined || BigInt(receipt.height || '0') <= 0n) continue;
        await record({ ...item, status: Number(receipt.code) === 0 ? 'CONFIRMED' : 'FAILED', amountOut: item.stage === 'swap' && Number(receipt.code) === 0 ? swapReceivedAmount(receipt, item.account, item.tokenOut) : undefined, error: Number(receipt.code) === 0 ? undefined : receipt.raw_log });
      } else {
        const receipt = await provider.getTransactionReceipt(item.hash);
        if (receipt && receipt.status !== null) await record({ ...item, status: receipt.status === 1 ? 'CONFIRMED' : 'FAILED', gasCost: `${ethers.formatEther(receipt.fee)} QOR` });
      }
    } catch { /* Unknown remains pending: never infer success from a network error. */ }
  }
  return history;
}
async function noPending(active: any) {
  await reconcile();
  if (history.some(i => i.account === active.cosmosAddress && i.status === 'PENDING')) throw new Error('A previous transaction is pending. Check Activity before sending another.');
}
function remember(kind: string, quote: any) {
  for (const [id, item] of quotes) if (item.quote.expiresAt <= Date.now()) quotes.delete(id);
  if (quotes.size >= 20) quotes.delete(quotes.keys().next().value!);
  quotes.set(quote.id, { kind, quote });
  return quote;
}
async function invoke(method: string, payload: any) {
  try {
    if (method === 'generateMnemonic') return generateNewMnemonic(128);
    if (method === 'validateMnemonic') return typeof payload.mnemonic === 'string' && isValidMnemonic(normalizeMnemonic(payload.mnemonic));
    if (method === 'restoreActivity') { history = payload; return true; }
    if (method === 'watchAccount') {
      const next: PublicAccount = {
        classicalAddress: ethers.getAddress(payload.evmAddress), cosmosAddress: payload.cosmosAddress,
        pqcPublicKeyHex: payload.pqcPublicKeyHex, pqcPublicKeyHash: payload.pqcPublicKeyHashHex,
      };
      if (ethers.getAddress(bech32ToEvmAddress(next.cosmosAddress)) !== next.classicalAddress
        || !ethers.isHexString(next.pqcPublicKeyHex) || !ethers.isHexString(next.pqcPublicKeyHash, 32)) {
        throw new Error('Invalid public wallet account.');
      }
      if (!samePublicAccount(publicAccount, next)) {
        if (busy) throw new Error('A transaction is still in progress.');
        epoch++; account = null; quotes.clear(); messageReviews.clear(); publicAccount = next;
      }
      return true;
    }
    if (method === 'lock') { epoch++; account = null; quotes.clear(); messageReviews.clear(); return true; }
    if (method === 'unlock') {
      if (busy) throw new Error('A transaction is still in progress.');
      const mnemonic = normalizeMnemonic(payload.mnemonic);
      if (!isValidMnemonic(mnemonic)) throw new Error('Enter a valid BIP-39 recovery phrase.');
      const next = deriveAccountKeys(mnemonic);
      const keypair = derivePqcKeypair(next);
      const pqcPublicKeyHex = ethers.hexlify(keypair.publicKey);
      keypair.secretKey.fill(0);
      const metadata: PublicAccount = { classicalAddress: next.classicalAddress, cosmosAddress: next.cosmosAddress,
        pqcPublicKeyHex, pqcPublicKeyHash: next.pqcPublicKeyHash };
      // Preserve canonical reviews only when authentication loads the exact reviewed public account.
      if (!samePublicAccount(publicAccount, metadata)) { quotes.clear(); messageReviews.clear(); }
      epoch++; publicAccount = metadata; account = next;
      return { evmAddress: next.classicalAddress, cosmosAddress: next.cosmosAddress, pqcPublicKeyHex, pqcPublicKeyHashHex: next.pqcPublicKeyHash };
    }
    if (method === 'reconcile') return await reconcile();
    if (method === 'balances') {
      const active = watching();
      const [bank, evm] = await Promise.all([swaps.balances(active.cosmosAddress), provider.getBalance(active.classicalAddress, 'pending')]);
      if (!samePublicAccount(publicAccount, active)) throw new Error('Account changed. Refresh balances.');
      return { bank, evmQor: ethers.formatEther(evm) };
    }
    const signing = ['executeSwap', 'executeTransfer', 'signDappMessage'].includes(method);
    const active = signing ? unlocked() : watching(), version = epoch;
    const check = () => {
      if (version !== epoch || (signing ? account !== active : publicAccount !== active)) {
        throw new Error('Wallet session changed. Review again.');
      }
    };
    // Shared quote APIs accept DerivedAccountKeys, but their public-status adapters above read only metadata.
    const quoteAccount = active as ReturnType<typeof deriveAccountKeys>;
    if (busy) throw new Error('A transaction is already in progress.');
    if (method === 'prepareDapp') {
      const intent = validateDappRequest(payload.method, payload.params, active.classicalAddress);
      if (intent.kind === 'message') {
        const reviewId = crypto.randomUUID();
        messageReviews.clear();
        messageReviews.set(reviewId, { hex: intent.hex, expiresAt: Date.now() + 120000 });
        return { kind: 'message', message: intent.text, reviewId };
      }
      await noPending(active); check();
      const quote = await transferQuotes.prepare(quoteAccount, intent.to, intent.amount);
      check(); remember('transfer', quote);
      return { kind: 'transfer', quote, reviewId: quote.id };
    }
    if (method === 'signDappMessage') {
      const review = messageReviews.get(payload.reviewId);
      messageReviews.delete(payload.reviewId);
      if (!review || review.expiresAt <= Date.now()) throw new Error('Message review expired. Review again.');
      check();
      const signature = await new ethers.Wallet(unlocked().classicalPrivateKey).signMessage(ethers.getBytes(review.hex));
      check(); return signature;
    }
    if (method === 'prepareSwap') {
      await noPending(active); check();
      const quote = await swapQuotes.prepareSwap(quoteAccount, payload.tokenIn, payload.tokenOut, payload.amount, payload.slippageBps);
      check(); return remember('swap', quote);
    }
    if (method === 'prepareTransfer') {
      if (payload.token !== 'QOR') throw new Error('Only QOR transfers are supported in this release.');
      await noPending(active); check();
      const quote = await transferQuotes.prepare(quoteAccount, payload.recipient.trim(), payload.amount);
      check(); return remember('transfer', quote);
    }
    const kind = method === 'executeSwap' ? 'swap' : method === 'executeTransfer' ? 'transfer' : null;
    if (!kind) throw new Error('Unsupported wallet operation.');
    const stored = quotes.get(payload.quoteId);
    if (!stored || stored.kind !== kind || stored.quote.expiresAt <= Date.now()) throw new Error('This review expired. Get a fresh quote.');
    const quote = stored.quote;
    quotes.delete(quote.id);
    busy = true;
    try {
      await noPending(active); check();
      // Re-check expiry throughout multi-step registration/authorization, not only at entry.
      const reviewed = () => { check(); if (Date.now() >= quote.expiresAt) throw new Error('The review expired. Completed setup fees may have been charged. Review again.'); };
      if (kind === 'swap') {
        let stage = 'swap';
        try {
          return await swaps.executeSwap(unlocked(), quote, reviewed, async (update, currentStage) => {
            stage = currentStage;
            await record({ hash: update.hash, account: active.cosmosAddress, nativeChain: true, stage, tokenIn: quote.tokenIn, tokenOut: quote.tokenOut, amountIn: quote.amountIn, amountOut: stage === 'swap' ? swapReceivedAmount(update.receipt, active.cosmosAddress, quote.tokenOut) : undefined, status: update.status, gasCost: `${ethers.formatUnits(update.feeUqor, 6)} QOR`, error: update.error });
          });
        } catch (error) {
          if (error instanceof NativeTxError) return { hash: error.update.hash, stage, status: error.update.status, explorerUrl: transactionExplorerUrl(error.update.hash), error: error.message };
          throw error;
        }
      }
      transferContext = { account: active.cosmosAddress, tokenIn: 'QOR', amountIn: quote.amount, recipient: quote.to, gasCost: `Up to ${quote.maxNetworkFee} QOR` };
      try {
        const hash = await transfers.send(unlocked(), quote, reviewed);
        return { hash, stage: 'transfer', status: 'PENDING', explorerUrl: transactionExplorerUrl(hash) };
      } catch (error) {
        if (error instanceof NativeTxError) return { hash: error.update.hash, stage: 'setup', status: error.update.status, explorerUrl: transactionExplorerUrl(error.update.hash), error: error.message };
        throw error;
      }
    } finally { busy = false; transferContext = null; }
  } catch (error) { throw new Error(errorMessage(error)); }
}
(window as any).ZeniEngine = { invoke };

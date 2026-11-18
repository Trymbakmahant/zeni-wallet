import { Transaction, formatUnits, getAddress } from 'ethers';
import { AMM_ASSETS, QORECHAIN_CONFIG } from '../account/constants.js';
import { evmToBech32Address } from '../crypto/derivation.js';

export interface ActivityTransfer { direction: 'in' | 'out' | 'self'; amount: string; token: string; counterparty?: string; }
export interface AccountActivity {
  hash: string;
  type: 'SEND' | 'RECEIVE' | 'SELF' | 'SWAP' | 'SETUP' | 'TRANSACTION';
  account?: string;
  from?: string;
  to?: string;
  token?: string;
  amount?: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  amountOut?: string;
  minAmountOut?: string;
  timestamp: number;
  status: 'CONFIRMED' | 'PENDING' | 'FAILED';
  gasCost: string;
  nativeChain?: boolean;
  evmChain?: boolean;
  evmHash?: string;
  explorerUrl?: string;
  error?: string;
  transfers?: ActivityTransfer[];
  source?: 'chain' | 'local' | 'merged';
}
export interface ActivityCursor { height: string; page: number; streams: number[]; account: string; }
export interface ActivityPage { items: AccountActivity[]; nextCursor: ActivityCursor | null; }
const PAGE_SIZE = 20;
const attrs = (event: any): Record<string, string> => Object.fromEntries(
  (Array.isArray(event?.attributes) ? event.attributes : []).filter((a: any) => typeof a?.key === 'string' && typeof a.value === 'string').map((a: any) => [a.key, a.value]),
);
function coin(amount: unknown, denom: unknown) {
  if (typeof amount !== 'string' || !/^\d{1,78}$/.test(amount) || typeof denom !== 'string' || !/^[a-zA-Z][a-zA-Z0-9/:._-]{0,150}$/.test(denom)) return null;
  if (denom === 'aqor') return { amount: formatUnits(amount, 18), token: 'QOR' };
  for (const [symbol, asset] of Object.entries(AMM_ASSETS)) {
    if (denom === asset.denom) return { amount: formatUnits(amount, asset.decimals), token: symbol };
  }
  // Never guess unknown token decimals or trust an arbitrary symbol/metadata URL.
  return { amount: BigInt(amount).toString(), token: `${denom} (base units)` };
}
const coinList = (value: unknown) => typeof value === 'string' ? value.split(',').slice(0,32).flatMap(raw => {
  const match = raw.match(/^(\d+)([a-zA-Z].*)$/); const parsed = match && coin(match[1], match[2]); return parsed ? [parsed] : [];
}) : [];

/** Parse committed Cosmos receipts. Never treat ante-handler fee transfers as received funds. */
export function parseAccountActivity(body: any, receipt: any, evmAddress: string): AccountActivity | null {
  const evm = getAddress(evmAddress), native = evmToBech32Address(evm);
  const matches = (address: unknown) => typeof address === 'string' && (address === native || address.toLowerCase() === evm.toLowerCase());
  if (!receipt || !/^[a-fA-F0-9]{64}$/.test(receipt.txhash) || !/^\d+$/.test(String(receipt.height)) || BigInt(receipt.height) <= 0n
    || !Number.isInteger(receipt.code) || !Number.isFinite(Date.parse(receipt.timestamp))) return null;
  const messages: any[] = Array.isArray(body?.body?.messages) ? body.body.messages : [];
  const events: any[] = Array.isArray(receipt.events) ? receipt.events : [];
  const transfers: ActivityTransfer[] = [];
  let involved = false, evmHash: string | undefined, isEvm = false;
  let failed = receipt.code !== 0;
  const addTransfer = (from: string, to: string, coins: { amount: string; token: string }[]) => {
    if (!matches(from) && !matches(to)) return;
    involved = true;
    const direction = matches(from) && matches(to) ? 'self' : matches(to) ? 'in' : 'out';
    for (const value of coins) if (Number(value.amount) > 0) transfers.push({ ...value, direction, counterparty: direction === 'in' ? from : to });
  };
  // Indexed message transfers include internal bank sends and MsgMultiSend outputs.
  for (const event of events) {
    const a = attrs(event);
    if (event.type === 'message' && matches(a.sender)) involved = true;
    if (event.type === 'transfer' && /^\d+$/.test(a.msg_index ?? '') && a.sender && a.recipient) {
      addTransfer(a.sender, a.recipient, coinList(a.amount));
    }
    if (event.type === 'ethereum_tx') {
      if (/^0x[\da-f]{64}$/i.test(a.ethereumTxHash ?? '')) evmHash = a.ethereumTxHash.toLowerCase();
      if (a.ethereumTxFailed && a.ethereumTxFailed !== 'false') failed = true;
    }
  }
  // Message fallback supports older receipts without msg_index on bank events.
  if (!transfers.length) for (const message of messages) {
    if (message?.['@type'] === '/cosmos.bank.v1beta1.MsgSend') {
      const values = (Array.isArray(message.amount) ? message.amount : []).flatMap((c: any) => { const parsed = coin(c?.amount,c?.denom); return parsed ? [parsed] : []; });
      addTransfer(message.from_address, message.to_address, values);
    }
  }
  for (const message of messages) {
    if ([message?.sender, message?.address, message?.from_address].some(matches)) involved = true;
    if (String(message?.['@type']).endsWith('MsgEthereumTx')) {
      isEvm = true;
      try {
        const tx = Transaction.from(message.raw);
        if (tx.chainId !== BigInt(QORECHAIN_CONFIG.chainId)) continue;
        if (matches(tx.from) || matches(tx.to)) involved = true;
        if (tx.hash) evmHash = tx.hash.toLowerCase();
        // Decode exact wei values; Cosmos fee events can be truncated to uqor.
        if (tx.from && tx.to && tx.data === '0x' && tx.value > 0n) {
          // The bank bridge may also emit the same QOR transfer; prefer the EVM value.
          for (let i=transfers.length-1;i>=0;i--) if (transfers[i].token === 'QOR') transfers.splice(i,1);
          addTransfer(tx.from, tx.to, [{ amount: formatUnits(tx.value,18), token: 'QOR' }]);
        }
      } catch { /* Unknown EVM encoding: show a generic transaction if other evidence links it. */ }
    }
  }
  if (!involved) return null;
  const types = messages.map(message => String(message?.['@type'] || ''));
  let type: AccountActivity['type'] = 'TRANSACTION';
  if (!failed) {
    if (types.some(type => type.includes('.amm.') && type.includes('Swap'))) type = 'SWAP';
    else if (types.some(type => type.includes('.pqc.') && type.includes('Register'))) type = 'SETUP';
    else if (transfers.length && transfers.every(t => t.direction === 'in')) type = 'RECEIVE';
    else if (transfers.length && transfers.every(t => t.direction === 'out')) type = 'SEND';
    else if (transfers.length && transfers.every(t => t.direction === 'self')) type = 'SELF';
  }
  const first = transfers[0];
  const incoming = transfers.find(t => t.direction === 'in'), outgoing = transfers.find(t => t.direction === 'out');
  const fees = !isEvm && Array.isArray(body?.auth_info?.fee?.amount) ? body.auth_info.fee.amount.flatMap((value: any) => {
    const parsed = coin(value?.amount, value?.denom); return parsed ? [`${parsed.amount} ${parsed.token}`] : [];
  }) : [];
  return {
    hash: receipt.txhash.toUpperCase(), account: native, timestamp: Date.parse(receipt.timestamp),
    type, status: failed ? 'FAILED' : 'CONFIRMED', source: 'chain', nativeChain: true, evmHash,
    gasCost: fees.join(', '), transfers: failed ? [] : transfers.slice(0,32),
    ...(first && transfers.length === 1 && !failed ? { amount: first.amount, token: first.token, ...(first.direction === 'in' ? { from: first.counterparty } : { to: first.counterparty }) } : {}),
    ...(type === 'SWAP' ? { amountIn: outgoing?.amount, tokenIn: outgoing?.token, amountOut: incoming?.amount, tokenOut: incoming?.token } : {}),
  };
}

export class AccountActivityClient {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async json(url: string, init?: RequestInit) {
    const response = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000), credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('Transaction history endpoint is unavailable.');
    return response.json();
  }
  async page(address: string, cursor?: ActivityCursor | null): Promise<ActivityPage> {
    const evm = getAddress(address), native = evmToBech32Address(evm);
    let height: string;
    if (cursor) {
      if (!/^[1-9]\d{0,15}$/.test(cursor.height) || !Number.isSafeInteger(cursor.page) || cursor.page < 1 || cursor.page > 10000 || cursor.account !== evm || !Array.isArray(cursor.streams) || !cursor.streams.length || cursor.streams.length > 5 || !cursor.streams.every(i => Number.isInteger(i) && i >= 0 && i < 5)) throw new Error('Invalid history cursor.');
      height = cursor.height;
    } else {
      const rpc = async (method: string, id: number) => {
        const result = await this.json(QORECHAIN_CONFIG.rpcUrls[0], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc:'2.0', id, method, params:[] }) });
        if (result.error || result.id !== id || !/^0x[0-9a-f]+$/i.test(result.result ?? '')) throw new Error('Invalid history network response.');
        return BigInt(result.result);
      };
      const [chainId, block] = await Promise.all([rpc('eth_chainId',1),rpc('eth_blockNumber',2)]);
      if (chainId !== 9800n || block <= 0n) throw new Error('History endpoint is not Diana testnet.');
      height = block.toString();
    }
    const page = cursor?.page ?? 1;
    const queries = [...new Set([
      `message.sender='${native}'`, `transfer.sender='${native}'`, `transfer.recipient='${native}'`,
      `ethereum_tx.recipient='${evm}'`, `ethereum_tx.recipient='${evm.toLowerCase()}'`,
    ])];
    const results = await Promise.all(queries.map((query,index)=>({query,index})).filter(({index})=>!cursor || cursor.streams.includes(index)).map(async ({query,index}) => {
      const params = new URLSearchParams({ query: `${query} AND tx.height<=${height}`, limit: String(PAGE_SIZE), page: String(page), order_by: 'ORDER_BY_DESC' });
      const result = await this.json(`${QORECHAIN_CONFIG.restUrl}/cosmos/tx/v1beta1/txs?${params}`);
      if (!Array.isArray(result.txs) || !Array.isArray(result.tx_responses) || result.txs.length !== result.tx_responses.length
        || result.txs.length > PAGE_SIZE || !/^\d+$/.test(String(result.total))) throw new Error('Invalid indexed history response.');
      return { index, items: result.tx_responses.flatMap((receipt: any, index: number) => {
        const item = parseAccountActivity(result.txs[index],receipt,evm); return item ? [item] : [];
      }), hasMore: BigInt(result.total) > BigInt(page * PAGE_SIZE) };
    }));
    return { items: mergeAccountActivity([],results.flatMap(result=>result.items)), nextCursor: results.some(result=>result.hasMore) ? {height,page:page+1,streams:results.filter(result=>result.hasMore).map(result=>result.index),account:evm} : null };
  }
}

/** Native and EVM hashes are different; only an explicit receipt alias may link them. */
export function mergeAccountActivity(local: AccountActivity[], chain: AccountActivity[]): AccountActivity[] {
  const rows = new Map<string, AccountActivity>();
  for (const item of local) rows.set(item.hash.toLowerCase(),{...item,source:item.source ?? 'local'});
  for (const item of chain) {
    const key = item.hash.toLowerCase();
    const previous = rows.get(key) ?? (item.evmHash ? rows.get(item.evmHash.toLowerCase()) : undefined);
    if (item.evmHash) rows.delete(item.evmHash.toLowerCase());
    rows.set(key,{...previous,...item,source:previous?.source === 'local' || previous?.source === 'merged' ? 'merged' : 'chain'});
  }
  return [...rows.values()].sort((a,b)=>b.timestamp-a.timestamp || a.hash.localeCompare(b.hash));
}

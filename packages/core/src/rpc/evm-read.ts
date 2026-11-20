import { getAddress } from 'ethers';
import { MAX_DAPP_REQUEST_BYTES, MAX_EVM_DATA_BYTES } from '../account/evm-request.js';

export const EVM_READ_METHODS = new Set([
  'eth_blockNumber', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_getBalance',
  'eth_getCode', 'eth_getTransactionCount', 'eth_call', 'eth_estimateGas',
  'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getLogs',
]);
const hexQuantity = (v: unknown) => typeof v === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i.test(v);
const hash = (v: unknown) => typeof v === 'string' && /^0x[0-9a-f]{64}$/i.test(v);
const block = (v: unknown) => ['latest', 'pending', 'earliest', 'safe', 'finalized'].includes(String(v)) || hexQuantity(v);
function address(v: unknown): boolean { try { return typeof v === 'string' && !!getAddress(v); } catch { return false; } }
function transaction(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.entries(v).every(([key, value]) => {
    if (['from', 'to'].includes(key)) return address(value);
    if (['data', 'input'].includes(key)) return typeof value === 'string' && /^0x(?:[0-9a-f]{2})*$/i.test(value) && value.length <= MAX_EVM_DATA_BYTES * 2 + 2;
    return ['value', 'gas', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas'].includes(key) && hexQuantity(value);
  });
}
/** Only bounded, read-only RPC calls to the wallet's configured chain. */
export function validateEvmRead(method: string, params: unknown = []): unknown[] {
  if (!EVM_READ_METHODS.has(method) || !Array.isArray(params) || JSON.stringify(params).length > MAX_DAPP_REQUEST_BYTES) throw new Error('Invalid read request.');
  let valid = false;
  if (['eth_blockNumber', 'eth_gasPrice', 'eth_maxPriorityFeePerGas'].includes(method)) valid = params.length === 0;
  else if (['eth_getTransactionReceipt', 'eth_getTransactionByHash'].includes(method)) valid = params.length === 1 && hash(params[0]);
  else if (['eth_getBalance', 'eth_getCode', 'eth_getTransactionCount'].includes(method)) valid = params.length === 2 && address(params[0]) && block(params[1]);
  else if (method === 'eth_getBlockByNumber') valid = params.length === 2 && block(params[0]) && typeof params[1] === 'boolean';
  else if (method === 'eth_getBlockByHash') valid = params.length === 2 && hash(params[0]) && typeof params[1] === 'boolean';
  else if (['eth_call', 'eth_estimateGas'].includes(method)) valid = params.length >= 1 && params.length <= 2 && transaction(params[0]) && (params.length === 1 || block(params[1]));
  else if (method === 'eth_getLogs' && params.length === 1) {
    const f = params[0];
    valid = !!f && typeof f === 'object' && !Array.isArray(f)
      && Object.keys(f).every(key => ['address', 'topics', 'fromBlock', 'toBlock', 'blockHash'].includes(key))
      && (address(f.address) || (Array.isArray(f.address) && f.address.length > 0 && f.address.length <= 10 && f.address.every(address)))
      && (f.topics === undefined || (Array.isArray(f.topics) && f.topics.length <= 4 && f.topics.every((t: unknown) => t === null || hash(t) || (Array.isArray(t) && t.length <= 10 && t.every(hash)))))
      && (f.blockHash ? hash(f.blockHash) && f.fromBlock === undefined && f.toBlock === undefined
        : hexQuantity(f.fromBlock) && hexQuantity(f.toBlock) && BigInt(f.toBlock) >= BigInt(f.fromBlock) && BigInt(f.toBlock) - BigInt(f.fromBlock) <= 2000n);
  }
  if (!valid) throw new Error('Unsupported read parameters. Log queries need an address and at most 2,000 explicit blocks.');
  return params;
}

import { getAddress, toQuantity, ZeroAddress } from 'ethers';
import { QORECHAIN_CONFIG } from './constants.js';

export const MAX_EVM_DATA_BYTES = 49_152;
export const MAX_DAPP_REQUEST_BYTES = 110_000;
export interface EvmIntent {
  kind: 'evm';
  from: string;
  to?: string;
  data: string;
  value: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  type?: string;
}

function quantity(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i.test(value)) {
    throw new Error(`${field} must be a hexadecimal quantity.`);
  }
  return toQuantity(BigInt(value));
}

/** Normalize only supported EVM fields; no dApp-controlled nonce or signing chain. */
export function validateEvmRequest(params: unknown, activeAddress: string): EvmIntent {
  if (!Array.isArray(params) || params.length !== 1 || !params[0] || typeof params[0] !== 'object' || Array.isArray(params[0])) throw new Error('Provide exactly one EVM transaction.');
  const tx = params[0] as Record<string, unknown>;
  const allowed = ['from', 'to', 'data', 'input', 'value', 'chainId', 'gas', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'type'];
  if (Object.keys(tx).some(key => !allowed.includes(key))) throw new Error('Unsupported transaction field. Zeni assigns the nonce after QoreChain authorization; access lists and delegation are not supported.');
  const from = getAddress(String(tx.from));
  if (from !== getAddress(activeAddress)) throw new Error('Transaction sender does not match the connected account.');
  if (tx.chainId !== undefined && BigInt(quantity(tx.chainId, 'chainId')) !== BigInt(QORECHAIN_CONFIG.chainId)) throw new Error('Only QoreChain Diana testnet (9800) is supported.');
  if (tx.data !== undefined && tx.input !== undefined && tx.data !== tx.input) throw new Error('Conflicting data and input fields.');
  const data = tx.data ?? tx.input ?? '0x';
  if (typeof data !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(data) || data.length > 2 + MAX_EVM_DATA_BYTES * 2) throw new Error('Invalid or oversized EVM calldata.');
  const to = tx.to == null ? undefined : getAddress(String(tx.to));
  if (to === ZeroAddress) throw new Error('The zero address cannot receive this transaction.');
  if (!to && data === '0x') throw new Error('Contract deployment requires bytecode.');
  const intent: EvmIntent = { kind: 'evm', from, ...(to ? { to } : {}), data: data.toLowerCase(), value: quantity(tx.value ?? '0x0', 'value') };
  for (const field of ['gas', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas', 'type'] as const) {
    if (tx[field] !== undefined) intent[field] = quantity(tx[field], field);
  }
  if (intent.gas && (BigInt(intent.gas) < 21_000n || BigInt(intent.gas) > 30_000_000n)) throw new Error('Gas limit must be between 21,000 and 30,000,000.');
  if (intent.type && !['0x0', '0x2'].includes(intent.type)) throw new Error('Only legacy and EIP-1559 transactions are supported.');
  if (intent.gasPrice && (intent.type === '0x2' || intent.maxFeePerGas || intent.maxPriorityFeePerGas)) throw new Error('Cannot mix legacy and EIP-1559 fees.');
  if (intent.type === '0x0' && (intent.maxFeePerGas || intent.maxPriorityFeePerGas)) throw new Error('Legacy transactions cannot use EIP-1559 fees.');
  return intent;
}

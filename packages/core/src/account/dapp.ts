import { getAddress, getBytes, formatEther } from 'ethers';
import { QORECHAIN_CONFIG } from './constants.js';
import { bech32ToEvmAddress } from '../crypto/derivation.js';
import { validateEvmRequest, type EvmIntent } from './evm-request.js';

export type DappIntent = { kind: 'transfer'; to: string; amount: string } | { kind: 'message'; text: string; hex: string } | EvmIntent;
/** Validate every field before displaying an approval; unsupported transaction semantics fail closed. */
export function validateDappRequest(method: string, params: unknown, activeAddress: string): DappIntent {
  const active = getAddress(activeAddress);
  if (!Array.isArray(params)) throw new Error('Request parameters must be an array.');
  if (method === 'personal_sign') {
    if (params.length !== 2 || typeof params[0] !== 'string' || typeof params[1] !== 'string' || getAddress(params[1]) !== active) throw new Error('Message signer does not match the connected account.');
    const hex = params[0];
    if (!/^0x(?:[0-9a-fA-F]{2}){1,4096}$/.test(hex)) throw new Error('Use a UTF-8 message of 1–4096 bytes.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(getBytes(hex));
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(text)) throw new Error('Messages containing hidden control characters cannot be signed.');
    return { kind: 'message', text, hex };
  }
  if (method === 'eth_sendTransaction') return validateEvmRequest(params, activeAddress);
  if (method !== 'zeni_sendQor') throw new Error('Unsupported signing method.');
  if (params.length !== 1 || !params[0] || typeof params[0] !== 'object' || Array.isArray(params[0])) throw new Error('Provide exactly one transaction.');
  const tx = params[0] as Record<string, unknown>;
  if (Object.keys(tx).some(key => !['from', 'to', 'value', 'chainId', 'data'].includes(key))) throw new Error('Custom gas, nonce, and transaction fields are not supported.');
  if (typeof tx.from !== 'string' || getAddress(tx.from) !== active) throw new Error('Transaction sender does not match the connected account.');
  if (tx.chainId !== undefined && (typeof tx.chainId !== 'string' || !/^0x[0-9a-fA-F]+$/.test(tx.chainId) || BigInt(tx.chainId) !== BigInt(QORECHAIN_CONFIG.chainId))) throw new Error('Only QoreChain Diana Testnet is supported.');
  if (tx.data !== undefined && tx.data !== '0x') throw new Error('Contract calls are not supported by Zeni Connect v1.');
  if (typeof tx.to !== 'string' || typeof tx.value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(tx.value) || BigInt(tx.value) <= 0n) throw new Error('Enter a recipient and a positive hexadecimal QOR value.');
  if (BigInt(tx.value) % (10n ** 12n) !== 0n) throw new Error('Native QOR transfers support up to 6 decimal places.');
  const recipient = tx.to.trim();
  let to: string;
  try {
    to = getAddress(recipient.toLowerCase().startsWith('qor1') ? bech32ToEvmAddress(recipient) : recipient);
  } catch {
    throw new Error('Enter a valid QoreChain qor1… or EVM 0x… recipient address.');
  }
  if (to === '0x0000000000000000000000000000000000000000') throw new Error('The zero address cannot receive this transfer.');
  return { kind: 'transfer', to, amount: formatEther(BigInt(tx.value)) };
}

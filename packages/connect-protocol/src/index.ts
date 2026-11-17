export const CHAIN_ID = '0x2648';
export const METHODS = ['eth_sendTransaction', 'personal_sign'] as const;
export const MAX_FRAME_BYTES = 32768;
export type Role = 'dapp' | 'wallet';
export type RpcRequest = { id: string; method: string; params?: unknown[] };
export type RpcError = { code: number; message: string };
export type Message =
  | { type: 'approved'; account: string; chainId: string; expiresAt: number }
  | { type: 'rejected'; reason: string }
  | { type: 'request'; request: RpcRequest; expiresAt: number }
  | { type: 'response'; id: string; result?: unknown; error?: RpcError }
  | { type: 'disconnect' };
export interface Envelope { id: string; iv: string; ciphertext: string }
export interface Pairing { relay: string; session: string; token: string; key: string }
export interface SessionInfo { id: string; origin: string; name: string; expiresAt: number; active: boolean }
export class ZeniError extends Error {
  constructor(public code: number, message: string) { super(message); this.name = 'ZeniError'; }
}
export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function unbase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export function secret(): string { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export function relayURL(value: string): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Relay must be an HTTPS origin (HTTP is allowed only on localhost).');
  }
  return url.origin;
}
export function pairingURI(pairing: Pairing): string {
  return 'zeni://connect#' + new URLSearchParams({ v: '1', ...pairing });
}
export function parsePairing(uri: string): Pairing {
  if (uri.length > 2048) throw new Error('Invalid pairing URI');
  const url = new URL(uri), params = new URLSearchParams(url.hash.slice(1));
  if (url.protocol !== 'zeni:' || url.host !== 'connect' || url.search || params.get('v') !== '1') throw new Error('Unsupported pairing URI');
  const session = params.get('session') || '', token = params.get('token') || '', key = params.get('key') || '';
  if (!/^[a-f0-9]{32}$/.test(session) || !/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Invalid pairing credentials');
  return { relay: relayURL(params.get('relay') || ''), session, token, key };
}
const aad = (session: string, role: Role, id: string) => new TextEncoder().encode(`zeni-connect:v1:${session}:${role}:${id}`);
export async function seal(key: string, session: string, role: Role, message: Message): Promise<Envelope> {
  const plaintext = new TextEncoder().encode(JSON.stringify(message));
  if (plaintext.length > 20000) throw new Error('Message too large');
  const id = crypto.randomUUID(), iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey('raw', unbase64url(key) as BufferSource, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(session, role, id) }, aes, plaintext);
  return { id, iv: base64url(iv), ciphertext: base64url(new Uint8Array(ciphertext)) };
}
export async function open(key: string, session: string, role: Role, frame: Envelope): Promise<Message> {
  if (!frame || typeof frame.id !== 'string' || typeof frame.iv !== 'string' || typeof frame.ciphertext !== 'string'
    || frame.ciphertext.length > MAX_FRAME_BYTES || unbase64url(frame.iv).length !== 12) throw new Error('Invalid encrypted frame');
  const aes = await crypto.subtle.importKey('raw', unbase64url(key) as BufferSource, 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64url(frame.iv) as BufferSource, additionalData: aad(session, role, frame.id) }, aes, unbase64url(frame.ciphertext) as BufferSource);
  const message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  if (!message || !['approved', 'rejected', 'request', 'response', 'disconnect'].includes(message.type)) throw new Error('Invalid protocol message');
  return message;
}

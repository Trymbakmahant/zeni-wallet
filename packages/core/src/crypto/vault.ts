import { bytesToHex, hexToBytes } from "./utils.js";

export const NEW_VAULT_PASSWORD_HINT = "Use at least 6 characters. Numbers and symbols are optional.";

// Creation policy only. Decryption must continue to accept existing credentials unchanged.
export function newVaultPasswordError(value: unknown): string | null {
  if (typeof value !== "string") return NEW_VAULT_PASSWORD_HINT;
  if (value.length > 1024) return "Password is too long. Use a shorter password.";
  return Array.from(value).length < 6 ? NEW_VAULT_PASSWORD_HINT : null;
}

export interface EncryptedVaultEnvelope {
  version: 1;
  kdf: {
    algorithm: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
  };
  cipher: {
    algorithm: "AES-256-GCM";
    iv: string;
    authTag: string;
    ciphertext: string;
  };
}

/**
 * Derives a 256-bit symmetric key using PBKDF2-HMAC-SHA256
 */
export async function deriveVaultKey(password: string, salt: Uint8Array, iterations = 600000): Promise<Uint8Array> {
  if (typeof password !== "string" || password.length > 1024
    || !Number.isSafeInteger(iterations) || iterations < 600000 || iterations > 2000000) {
    throw new Error("Invalid vault key parameters");
  }
  const passwordBytes = new TextEncoder().encode(password);
  try {
    const key = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({
      name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations,
    }, key, 256));
  } finally { passwordBytes.fill(0); }
}

/**
 * Encrypts arbitrary plaintext JSON data with AES-GCM
 */
export async function encryptVault(payload: Record<string, unknown>, password: string): Promise<EncryptedVaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyBytes = await deriveVaultKey(password, salt, 600000);

  const encodedData = new TextEncoder().encode(JSON.stringify(payload));
  let encryptedBytes: Uint8Array;
  try {
    const subtleKey = await crypto.subtle.importKey("raw", keyBytes as unknown as BufferSource, "AES-GCM", false, ["encrypt"]);
    encryptedBytes = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 }, subtleKey, encodedData,
    ));
  } finally {
    keyBytes.fill(0);
    encodedData.fill(0);
  }
  const ciphertextBytes = encryptedBytes.slice(0, -16);
  const tagBytes = encryptedBytes.slice(-16);

  return {
    version: 1,
    kdf: {
      algorithm: "PBKDF2-SHA256",
      iterations: 600000,
      salt: bytesToHex(salt),
    },
    cipher: {
      algorithm: "AES-256-GCM",
      iv: bytesToHex(iv),
      authTag: bytesToHex(tagBytes),
      ciphertext: bytesToHex(ciphertextBytes),
    },
  };
}

/**
 * Decrypts an encrypted vault envelope
 */
export async function decryptVault(envelope: EncryptedVaultEnvelope, password: string): Promise<Record<string, unknown>> {
  if (envelope?.version !== 1 || envelope.kdf?.algorithm !== "PBKDF2-SHA256"
    || envelope.cipher?.algorithm !== "AES-256-GCM") throw new Error("Unsupported vault format");
  const isHex = (value: unknown, length?: number): value is string => typeof value === "string"
    && /^(?:[a-fA-F0-9]{2})+$/.test(value) && (length === undefined || value.length === length);
  if (!isHex(envelope.kdf.salt, 64) || !isHex(envelope.cipher.iv, 24)
    || !isHex(envelope.cipher.authTag, 32) || !isHex(envelope.cipher.ciphertext)
    || envelope.cipher.ciphertext.length > 2_000_000) throw new Error("Invalid vault envelope");
  const salt = hexToBytes(envelope.kdf.salt);
  const iv = hexToBytes(envelope.cipher.iv);
  const ciphertext = hexToBytes(envelope.cipher.ciphertext);
  const tag = hexToBytes(envelope.cipher.authTag);
  const keyBytes = await deriveVaultKey(password, salt, envelope.kdf.iterations);
  let plaintext: Uint8Array | undefined;
  try {
    const subtleKey = await crypto.subtle.importKey("raw", keyBytes as unknown as BufferSource, "AES-GCM", false, ["decrypt"]);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);
    plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 }, subtleKey, combined,
    ));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } finally {
    keyBytes.fill(0);
    plaintext?.fill(0);
  }
}

import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha256.js";

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
  const enc = new TextEncoder();
  return pbkdf2(sha256, enc.encode(password), salt, { c: iterations, dkLen: 32 });
}

/**
 * Encrypts arbitrary plaintext JSON data with AES-GCM
 */
export async function encryptVault(payload: Record<string, unknown>, password: string): Promise<EncryptedVaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyBytes = await deriveVaultKey(password, salt, 600000);

  const subtleKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const enc = new TextEncoder();
  const encodedData = enc.encode(JSON.stringify(payload));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 },
    subtleKey,
    encodedData as unknown as BufferSource
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  // In AES-GCM SubtleCrypto, tag is appended to ciphertext
  const ciphertextBytes = encryptedBytes.slice(0, -16);
  const tagBytes = encryptedBytes.slice(-16);

  // Clean sensitive key material in place
  keyBytes.fill(0);

  return {
    version: 1,
    kdf: {
      algorithm: "PBKDF2-SHA256",
      iterations: 600000,
      salt: Buffer.from(salt).toString("hex"),
    },
    cipher: {
      algorithm: "AES-256-GCM",
      iv: Buffer.from(iv).toString("hex"),
      authTag: Buffer.from(tagBytes).toString("hex"),
      ciphertext: Buffer.from(ciphertextBytes).toString("hex"),
    },
  };
}

/**
 * Decrypts an encrypted vault envelope
 */
export async function decryptVault(envelope: EncryptedVaultEnvelope, password: string): Promise<Record<string, unknown>> {
  const salt = Buffer.from(envelope.kdf.salt, "hex");
  const iv = Buffer.from(envelope.cipher.iv, "hex");
  const ciphertext = Buffer.from(envelope.cipher.ciphertext, "hex");
  const tag = Buffer.from(envelope.cipher.authTag, "hex");

  const keyBytes = await deriveVaultKey(password, salt, envelope.kdf.iterations);

  const subtleKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 },
      subtleKey,
      combined as unknown as BufferSource
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decryptedBuffer));
  } finally {
    keyBytes.fill(0);
  }
}

import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { shake256 } from "@noble/hashes/sha3.js";
import { ethers, keccak256 } from "ethers";

export interface DerivedAccountKeys {
  classicalPrivateKey: string;
  classicalAddress: string;
  pqcSeedHex: string;
  pqcContext: string;
}

/**
 * Normalizes mnemonic text strictly to Unicode NFKD and collapses consecutive whitespace
 */
export function normalizeMnemonic(rawMnemonic: string): string {
  return rawMnemonic
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Validates a 12- or 24-word BIP-39 mnemonic
 */
export function isValidMnemonic(mnemonic: string): boolean {
  const normalized = normalizeMnemonic(mnemonic);
  return validateMnemonic(normalized, wordlist);
}

/**
 * Derives both Classical (secp256k1) and Post-Quantum (ML-DSA-87) key material from mnemonic
 */
export function deriveAccountKeys(
  mnemonic: string,
  passphrase = "",
  accountIndex = 0
): DerivedAccountKeys {
  const cleanMnemonic = normalizeMnemonic(mnemonic);
  const cleanPassphrase = passphrase.normalize("NFKD");

  // 1. BIP-39 Seed
  const seed = mnemonicToSeedSync(cleanMnemonic, cleanPassphrase);

  // 2. BIP-44 Ethereum HD Path: m/44'/60'/0'/0/{accountIndex}
  const root = HDKey.fromMasterSeed(seed);
  const path = `m/44'/60'/0'/0/${accountIndex}`;
  const child = root.derive(path);

  if (!child.privateKey) {
    throw new Error("Failed to derive private key at path " + path);
  }

  const classicalPrivateKey = "0x" + Buffer.from(child.privateKey).toString("hex");
  const classicalWallet = new ethers.Wallet(classicalPrivateKey);
  const classicalAddress = classicalWallet.address;

  // 3. Post-Quantum Seed Derivation using SHAKE-256
  // Context string binds account address and credentials
  const pqcContext = `qorechain:pqc:v1|${classicalAddress.toLowerCase()}|${cleanMnemonic}|${cleanPassphrase}`;
  const seedBytes = shake256(new TextEncoder().encode(pqcContext), { dkLen: 32 });
  const pqcSeedHex = "0x" + Buffer.from(seedBytes).toString("hex");

  return {
    classicalPrivateKey,
    classicalAddress,
    pqcSeedHex,
    pqcContext,
  };
}

/**
 * Computes the keccak256 hash of a PQC public key for on-chain binding
 */
export function hashPqcPublicKey(pqcPublicKeyBytes: Uint8Array): string {
  return keccak256(pqcPublicKeyBytes);
}

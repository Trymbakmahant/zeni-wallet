import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { shake256 } from "@noble/hashes/sha3.js";
import { bech32 } from "@scure/base";
import { ethers, getBytes, keccak256 } from "ethers";
import { bytesToHex } from "./utils.js";

export interface DerivedAccountKeys {
  classicalPrivateKey: string;
  classicalAddress: string;
  cosmosAddress: string;
  pqcSeedHex: string;
  pqcContext: string;
  pqcPublicKeyHash: string;
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
 * Generates a fresh 12-word BIP-39 mnemonic
 */
export function generateNewMnemonic(strength = 128): string {
  return generateMnemonic(wordlist, strength);
}

/**
 * Validates a 12- or 24-word BIP-39 mnemonic
 */
export function isValidMnemonic(mnemonic: string): boolean {
  const normalized = normalizeMnemonic(mnemonic);
  return validateMnemonic(normalized, wordlist);
}

/**
 * Converts a 20-byte EVM hex address (0x...) into QoreChain Cosmos Bech32 format (qor1...)
 */
export function evmToBech32Address(evmAddress: string, prefix = "qor"): string {
  const cleanHex = evmAddress.toLowerCase().replace(/^0x/, "");
  const bytes = getBytes("0x" + cleanHex);
  const words = bech32.toWords(bytes);
  return bech32.encode(prefix, words);
}

/**
 * Converts a QoreChain Cosmos Bech32 format (qor1...) into a 20-byte EVM hex address (0x...)
 */
export function bech32ToEvmAddress(bech32Address: string): string {
  const decoded = bech32.decode(bech32Address as `${string}1${string}`);
  const bytes = bech32.fromWords(decoded.words);
  return ethers.hexlify(bytes);
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

  const classicalPrivateKey = "0x" + bytesToHex(child.privateKey);
  const classicalWallet = new ethers.Wallet(classicalPrivateKey);
  const classicalAddress = classicalWallet.address;
  const cosmosAddress = evmToBech32Address(classicalAddress);

  // 3. Post-Quantum Seed Derivation using SHAKE-256 (Canonical QoreChain specification)
  // Context string binds account address, Cosmos format, and credentials
  const pqcContext = cleanPassphrase
    ? `qorechain:pqc:v1|${cosmosAddress}|${cleanMnemonic}|${cleanPassphrase}`
    : `qorechain:pqc:v1|${cosmosAddress}|${cleanMnemonic}`;
  const seedBytes = shake256(new TextEncoder().encode(pqcContext), { dkLen: 32 });
  const pqcSeedHex = "0x" + bytesToHex(seedBytes);
  const pqcPublicKeyHash = keccak256(seedBytes);

  return {
    classicalPrivateKey,
    classicalAddress,
    cosmosAddress,
    pqcSeedHex,
    pqcContext,
    pqcPublicKeyHash,
  };
}

/**
 * Computes the keccak256 hash of a PQC public key for on-chain binding
 */
export function hashPqcPublicKey(pqcPublicKeyBytes: Uint8Array): string {
  return keccak256(pqcPublicKeyBytes);
}

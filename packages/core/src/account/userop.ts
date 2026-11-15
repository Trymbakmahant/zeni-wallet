import { AbiCoder, ethers, getBytes, hexlify, keccak256 } from "ethers";

export interface UserOperationData {
  sender: string;
  nonce: bigint | string | number;
  initCode: string;
  callData: string;
  callGasLimit: bigint | string | number;
  verificationGasLimit: bigint | string | number;
  preVerificationGas: bigint | string | number;
  maxFeePerGas: bigint | string | number;
  maxPriorityFeePerGas: bigint | string | number;
  paymasterAndData: string;
  signature?: string;
}

export interface HybridSignatureComponents {
  classicalSignature: string; // 65-byte hex
  pqcSignature: string;        // ML-DSA-87 signature hex
  pqcPublicKey: string;        // ML-DSA-87 public key hex
}

const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * Encodes the three hybrid signature components into the standard 7,520-byte ABI tuple expected by ZeniSmartAccount
 */
export function encodeHybridSignature(components: HybridSignatureComponents): string {
  return abiCoder.encode(
    ["bytes", "bytes", "bytes"],
    [components.classicalSignature, components.pqcSignature, components.pqcPublicKey]
  );
}

/**
 * Decodes the composite signature tuple back into individual components
 */
export function decodeHybridSignature(signatureHex: string): HybridSignatureComponents {
  const [classicalSignature, pqcSignature, pqcPublicKey] = abiCoder.decode(
    ["bytes", "bytes", "bytes"],
    signatureHex
  );
  return {
    classicalSignature,
    pqcSignature,
    pqcPublicKey,
  };
}

/**
 * Encodes single execution callData for ZeniSmartAccount.execute(address, uint256, bytes)
 */
export function encodeAccountExecute(dest: string, value: bigint | number | string, func: string): string {
  const iface = new ethers.Interface([
    "function execute(address dest, uint256 value, bytes calldata func)",
  ]);
  return iface.encodeFunctionData("execute", [dest, value, func]);
}

/**
 * Encodes batch execution callData for ZeniSmartAccount.executeBatch
 */
export function encodeAccountExecuteBatch(
  dest: string[],
  value: (bigint | number | string)[],
  func: string[]
): string {
  const iface = new ethers.Interface([
    "function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func)",
  ]);
  return iface.encodeFunctionData("executeBatch", [dest, value, func]);
}

/**
 * Computes standard ERC-4337 v0.7 UserOperation hash for signing
 */
export function getUserOperationHash(
  userOp: UserOperationData,
  entryPointAddress: string,
  chainId: number
): string {
  const packedUserOp = abiCoder.encode(
    [
      "address",
      "uint256",
      "bytes32",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "bytes32",
    ],
    [
      userOp.sender,
      BigInt(userOp.nonce),
      keccak256(userOp.initCode || "0x"),
      keccak256(userOp.callData || "0x"),
      BigInt(userOp.callGasLimit || 0),
      BigInt(userOp.verificationGasLimit || 0),
      BigInt(userOp.preVerificationGas || 0),
      BigInt(userOp.maxFeePerGas || 0),
      BigInt(userOp.maxPriorityFeePerGas || 0),
      keccak256(userOp.paymasterAndData || "0x"),
    ]
  );

  const enc = abiCoder.encode(
    ["bytes32", "address", "uint256"],
    [keccak256(packedUserOp), entryPointAddress, chainId]
  );

  return keccak256(enc);
}

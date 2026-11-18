import { Interface, getAddress, getBytes, keccak256 } from "ethers";
import { QORECHAIN_CONFIG, DILITHIUM5_PUBKEY_BYTES } from "../account/constants.js";

export const PQC_KEY_STATUS_ADDRESS = "0x0000000000000000000000000000000000000a02";
export const PQC_KEY_STATUS_ABI = new Interface([
  "function pqcKeyStatus(address account) view returns (bool registered, uint8 algorithmId, bytes pubkey)",
]);

export interface PqcKeyStatus {
  account: string;
  registered: boolean;
  algorithmId: number;
  publicKeyHash: string | null;
  matchesLocalKey: boolean | null;
  blockNumber: string;
}

/** Read-only snapshot. Registration alone does not prove possession or authorize a transaction. */
export async function readPqcKeyStatus(
  address: string,
  localPublicKeyHash: string | null,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<PqcKeyStatus> {
  const account = getAddress(address);
  if (localPublicKeyHash !== null && !/^0x[0-9a-fA-F]{64}$/.test(localPublicKeyHash)) {
    throw new Error("The local PQC key hash is invalid. Lock and unlock your wallet before retrying.");
  }
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  let id = 0;
  async function rpc(method: string, params: unknown[]): Promise<string> {
    const requestId = ++id;
    const response = await fetchImpl(QORECHAIN_CONFIG.rpcUrls[0], {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
    });
    if (!response.ok) throw new Error("PQC status is unavailable. Retry when the network is reachable.");
    const body = await response.json();
    if (body.jsonrpc !== "2.0" || body.id !== requestId || body.error || typeof body.result !== "string") {
      throw new Error("The network returned an invalid PQC status response.");
    }
    return body.result;
  }
  const chainId = await rpc("eth_chainId", []);
  if (!/^0x[0-9a-f]+$/i.test(chainId) || BigInt(chainId) !== BigInt(QORECHAIN_CONFIG.chainId)) {
    throw new Error("PQC status endpoint is not on Diana testnet.");
  }
  const blockNumber = await rpc("eth_blockNumber", []);
  if (!/^0x[0-9a-f]+$/i.test(blockNumber)) throw new Error("Invalid status block number.");
  const result = await rpc("eth_call", [{
    to: PQC_KEY_STATUS_ADDRESS,
    data: PQC_KEY_STATUS_ABI.encodeFunctionData("pqcKeyStatus", [account]),
  }, blockNumber]);
  try {
    const [registered, algorithm, publicKey] = PQC_KEY_STATUS_ABI.decodeFunctionResult("pqcKeyStatus", result);
    const algorithmId = Number(algorithm);
    if (registered && (algorithmId !== 1 || getBytes(publicKey).length !== DILITHIUM5_PUBKEY_BYTES)) {
      throw new Error("Unsupported registered PQC key.");
    }
    const publicKeyHash = registered ? keccak256(publicKey) : null;
    return {
      account, registered, algorithmId, publicKeyHash, blockNumber,
      matchesLocalKey: publicKeyHash && localPublicKeyHash
        ? publicKeyHash.toLowerCase() === localPublicKeyHash.toLowerCase() : null,
    };
  } catch {
    throw new Error("PQC status could not be verified: the precompile returned an unsupported or invalid key.");
  }
}

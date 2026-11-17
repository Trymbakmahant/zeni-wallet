import { ethers, getBytes } from "ethers";
import { buildRegisterPqcKeyMsg, clearPqcStatusCache, fetchPqcStatus, isRegisteredPqcKey, qorechainRegistry, resolveSignBytesVersion, signClassicalEth, signHybridEth, signProofOfPossession, type EncodeObject, type EthSignParams } from "@qorechain/sdk";
import { QORECHAIN_CONFIG } from "../account/constants.js";
import { derivePqcKeypair, type DerivedAccountKeys } from "../crypto/derivation.js";

const WEI_PER_UQOR = 10n ** 12n;
export const NATIVE_GAS_CAP = 600_000n;
export interface NativeFeeBudget { setupFeeCap: string; setupGasPrice: string; }
export interface NativeTxUpdate {
  hash: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  feeUqor: string;
  receipt?: any;
  error?: string;
}
export type NativeTxObserver = (update: NativeTxUpdate) => Promise<void>;
export class NativeTxError extends Error {
  constructor(message: string, public readonly update: NativeTxUpdate) { super(message); }
}

export function parseAccountSequence(response: any): { accountNumber: bigint; sequence: bigint } {
  const account = response?.account?.base_account
    ?? response?.account?.base_vesting_account?.base_account
    ?? response?.account;
  if (!/^\d+$/.test(String(account?.account_number)) || !/^\d+$/.test(String(account?.sequence))) {
    throw new Error("Could not read the account number and sequence from QoreChain.");
  }
  return { accountNumber: BigInt(account.account_number), sequence: BigInt(account.sequence) };
}

/** Shared eth-native signing for Cosmos-lane transactions. */
export class NativeTransactionClient {
  constructor(
    protected readonly provider: ethers.JsonRpcProvider,
    protected readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  protected async rest(path: string, body?: unknown): Promise<any> {
    const response = await this.fetchImpl(`${QORECHAIN_CONFIG.restUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(json.message || `QoreChain request failed (${response.status}).`), { status: response.status });
    }
    return json;
  }

  protected async status(account: DerivedAccountKeys) {
    clearPqcStatusCache();
    const status = await fetchPqcStatus({ rest: QORECHAIN_CONFIG.restUrl, address: account.cosmosAddress, fetch: this.fetchImpl });
    if (status.registered) {
      if (isRegisteredPqcKey(status, derivePqcKeypair(account).publicKey) !== true) {
        throw new Error("This account has a different or unreadable PQC key registered. Restore the PQC key used to register it before sending; Zeni will not overwrite it.");
      }
      if (status.possessionProven === false) {
        throw new Error("The registered PQC key has no proof of possession. Complete QoreChain key migration with the original key before sending.");
      }
    }
    return status;
  }

  protected async checkNetwork() {
    const [chainId, info] = await Promise.all([
      this.provider.send("eth_chainId", []),
      this.rest("/cosmos/base/tendermint/v1beta1/node_info"),
    ]);
    if (BigInt(chainId) !== BigInt(QORECHAIN_CONFIG.chainId)
      || info.default_node_info?.network !== QORECHAIN_CONFIG.cosmosChainId) {
      throw new Error("The RPC endpoints are not connected to QoreChain Diana testnet.");
    }
  }

  protected async broadcastNative(account: DerivedAccountKeys, message: EncodeObject, classical: boolean, quote: NativeFeeBudget, assertUnlocked: () => void, observer?: NativeTxObserver): Promise<NativeTxUpdate & { nextSequence: bigint }> {
    const sequence = parseAccountSequence(await this.rest(`/cosmos/auth/v1beta1/accounts/${account.cosmosAddress}`));
    const registry = qorechainRegistry();
    const keypair = derivePqcKeypair(account);
    try {
      const params: EthSignParams = {
        account: { privateKey: account.classicalPrivateKey, publicKey: ethers.SigningKey.computePublicKey(account.classicalPrivateKey, true), pqc: keypair },
        chainId: QORECHAIN_CONFIG.cosmosChainId, ...sequence, messages: [message],
        fee: { amount: [{ denom: "uqor", amount: quote.setupFeeCap }], gas: NATIVE_GAS_CAP.toString() },
        encodeMessage: (m) => registry.encodeAsAny(m),
        signBytesVersion: classical ? undefined : await resolveSignBytesVersion({ chainId: QORECHAIN_CONFIG.cosmosChainId, rest: QORECHAIN_CONFIG.restUrl, fetch: this.fetchImpl }),
      };
      const sign = classical ? signClassicalEth : signHybridEth;
      const simulated = await this.rest("/cosmos/tx/v1beta1/simulate", { tx_bytes: ethers.encodeBase64(sign(params).txRawBytes) });
      const used = BigInt(simulated.gas_info?.gas_used ?? "0");
      if (used <= 0n) throw new Error("QoreChain returned an invalid setup gas estimate.");
      // Hybrid verification is not charged in every simulation path; reserve it explicitly.
      const gas = (used * 13n + 9n) / 10n + (classical ? 0n : 40_000n);
      const fee = (gas * ethers.parseUnits(quote.setupGasPrice, 12) + WEI_PER_UQOR - 1n) / WEI_PER_UQOR;
      if (gas > NATIVE_GAS_CAP || fee > BigInt(quote.setupFeeCap)) {
        throw new Error("Setup gas exceeds the reviewed fee allowance. No further transaction was sent.");
      }
      params.fee = { amount: [{ denom: "uqor", amount: fee.toString() }], gas: gas.toString() };
      const bytes = sign(params).txRawBytes;
      // Hash locally so an uncertain HTTP response still identifies the submitted setup transaction.
      const hash = ethers.sha256(bytes).slice(2).toUpperCase();
      const pending: NativeTxUpdate = { hash, status: "PENDING", feeUqor: fee.toString() };
      const reportFailure = async (message: string, charged = true): Promise<never> => {
        const update: NativeTxUpdate = { ...pending, feeUqor: charged ? pending.feeUqor : "0", status: "FAILED", error: message };
        await observer?.(update);
        throw new NativeTxError(message, update);
      };
      let submitted: any;
      assertUnlocked();
      // Persist the real hash before making an irreversible broadcast request.
      await observer?.(pending);
      assertUnlocked();
      try {
        submitted = await this.rest("/cosmos/tx/v1beta1/txs", { tx_bytes: ethers.encodeBase64(bytes), mode: "BROADCAST_MODE_SYNC" });
      } catch {
        throw new NativeTxError(`Broadcast status is unknown. Check transaction ${hash} before retrying.`, pending);
      }
      const result = submitted.tx_response;
      if (!result || result.code === undefined) throw new NativeTxError(`Missing broadcast response for ${hash}. Check its status before retrying.`, pending);
      if (Number(result.code) !== 0) return reportFailure(result.raw_log || "QoreChain rejected the transaction.", false);
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        let receipt: any;
        try {
          receipt = (await this.rest(`/cosmos/tx/v1beta1/txs/${hash}`)).tx_response;
        } catch (error: any) {
          if (error.status !== 404) throw new NativeTxError(`Could not confirm transaction ${hash}. Check its status before retrying.`, pending);
        }
        if (receipt) {
          if (receipt.code === undefined) throw new NativeTxError(`Missing receipt status for ${hash}.`, pending);
          if (Number(receipt.code) !== 0) return reportFailure(`Transaction ${hash} failed: ${receipt.raw_log || receipt.code}`);
          if (BigInt(receipt.height || "0") > 0n) {
            const confirmed: NativeTxUpdate = { ...pending, status: "CONFIRMED", receipt };
            await observer?.(confirmed);
            return { ...confirmed, nextSequence: sequence.sequence + 1n };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
      throw new NativeTxError(`Transaction ${hash} is still pending. Check its status before retrying.`, pending);
    } finally {
      keypair.secretKey.fill(0);
    }
  }

  protected async ensureRegistered(account: DerivedAccountKeys, registrationApproved: boolean, budget: NativeFeeBudget, assertUnlocked: () => void, observer?: NativeTxObserver) {
    const status = await this.status(account);
    if (status.registered) return;
    if (!registrationApproved) throw new Error("PQC registration changed. Review again.");
    const keypair = derivePqcKeypair(account);
    try {
      const message = buildRegisterPqcKeyMsg(account.cosmosAddress, {
        pqcKeypair: keypair,
        ecdsaPubkey: getBytes(ethers.SigningKey.computePublicKey(account.classicalPrivateKey, true)),
        proofOfPossession: signProofOfPossession({ chainId: QORECHAIN_CONFIG.cosmosChainId, account: account.cosmosAddress, keypair }),
      });
      assertUnlocked();
      await this.broadcastNative(account, message, true, budget, assertUnlocked, observer);
    } finally { keypair.secretKey.fill(0); }
    if (!(await this.status(account)).registered) throw new Error("PQC registration is not yet visible. Wait before retrying.");
  }

  public async receipt(hash: string): Promise<any | null> {
    if (!/^[A-Fa-f0-9]{64}$/.test(hash)) throw new Error("Invalid native transaction hash.");
    try { return (await this.rest(`/cosmos/tx/v1beta1/txs/${hash}`)).tx_response ?? null; }
    catch (error: any) { if (error.status === 404) return null; throw error; }
  }
}

import { ethers, formatEther, getBytes, parseEther } from "ethers";
import {
  buildRegisterPqcKeyMsg, clearPqcStatusCache, fetchPqcStatus,
  isRegisteredPqcKey, openEvmWindowMsg, qorechainRegistry,
  recommendedGasPriceUqor, resolveSignBytesVersion,
  signClassicalEth, signHybridEth, signProofOfPossession,
  type EncodeObject, type EthSignParams,
} from "@qorechain/sdk";
import { QORECHAIN_CONFIG } from "../account/constants.js";
import { bech32ToEvmAddress, derivePqcKeypair, type DerivedAccountKeys } from "../crypto/derivation.js";

const WEI_PER_UQOR = 10n ** 12n;
const SETUP_GAS_CAP = 600_000n;
export const QOR_WINDOW_BLOCKS = 60;

export interface QorTransferQuote {
  id: string;
  from: string;
  to: string;
  amount: string;
  value: string;
  gasPrice: string;
  gasLimit: string;
  registrationRequired: boolean;
  setupGasPrice: string;
  setupFeeCap: string;
  maxNetworkFee: string;
  windowMaxValue: string;
  windowBlocks: number;
  expiresAt: number;
}

/** Round up: the chain budgets value PLUS the EVM maximum gas fee in uqor. */
export function windowValueUqor(value: bigint, gasLimit: bigint, gasPrice: bigint): bigint {
  return (value + gasLimit * gasPrice + WEI_PER_UQOR - 1n) / WEI_PER_UQOR;
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

/** Native-lane setup followed by an EVM send. Quotes contain no private material. */
export class QorTransferClient {
  constructor(
    private readonly provider: ethers.JsonRpcProvider,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  private async rest(path: string, body?: unknown): Promise<any> {
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

  private async status(account: DerivedAccountKeys) {
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

  private async checkNetwork() {
    const [chainId, info] = await Promise.all([
      this.provider.send("eth_chainId", []),
      this.rest("/cosmos/base/tendermint/v1beta1/node_info"),
    ]);
    if (BigInt(chainId) !== BigInt(QORECHAIN_CONFIG.chainId)
      || info.default_node_info?.network !== QORECHAIN_CONFIG.cosmosChainId) {
      throw new Error("The RPC endpoints are not connected to QoreChain Diana testnet.");
    }
  }

  async prepare(account: DerivedAccountKeys, recipient: string, amount: string): Promise<QorTransferQuote> {
    let value = amount === "MAX" ? 0n : parseEther(amount);
    if (amount !== "MAX" && value <= 0n) throw new Error("Enter a QOR amount greater than zero.");
    const to = ethers.getAddress(recipient.startsWith("qor1") || recipient.startsWith("cosmos1")
      ? bech32ToEvmAddress(recipient) : recipient);
    await this.checkNetwork();
    const [status, gasPriceHex, code, setupGasPrice] = await Promise.all([
      this.status(account), this.provider.send("eth_gasPrice", []),
      this.provider.getCode(to),
      recommendedGasPriceUqor({ rest: QORECHAIN_CONFIG.restUrl, fetch: this.fetchImpl }),
    ]);
    if (code !== "0x") throw new Error("This QOR send supports ordinary wallet recipients. Contract recipients need a contract-call authorization.");
    const gasPrice = BigInt(gasPriceHex);
    if (gasPrice <= 0n) throw new Error("QoreChain returned an invalid gas price.");
    const gasLimit = 21_000n;
    // Reserve a cap before registration; window simulation requires registration to be committed.
    const setupPriceWei = ethers.parseUnits(setupGasPrice, 12);
    const setupFeeCap = (SETUP_GAS_CAP * setupPriceWei + WEI_PER_UQOR - 1n) / WEI_PER_UQOR;
    const maxFee = gasLimit * gasPrice + setupFeeCap * WEI_PER_UQOR * (status.registered ? 1n : 2n);
    const balance = BigInt(await this.provider.send("eth_getBalance", [account.classicalAddress, "pending"]));
    if (amount === "MAX") value = balance > maxFee ? balance - maxFee : 0n;
    if (value <= 0n) throw new Error("Insufficient QOR to cover transfer and setup fees.");
    if (balance < value + maxFee) {
      throw new Error(`Insufficient QOR for the amount and up to ${formatEther(maxFee)} QOR in transfer/setup fees. Max send: ${formatEther(balance > maxFee ? balance - maxFee : 0n)} QOR.`);
    }
    return {
      id: crypto.randomUUID(), from: account.classicalAddress, to, amount: formatEther(value),
      value: value.toString(), gasPrice: gasPrice.toString(), gasLimit: gasLimit.toString(),
      registrationRequired: !status.registered, setupGasPrice, setupFeeCap: setupFeeCap.toString(),
      maxNetworkFee: formatEther(maxFee), windowMaxValue: windowValueUqor(value, gasLimit, gasPrice).toString(),
      windowBlocks: QOR_WINDOW_BLOCKS, expiresAt: Date.now() + 120_000,
    };
  }

  private async nativeSend(account: DerivedAccountKeys, message: EncodeObject, classical: boolean, quote: QorTransferQuote, assertUnlocked: () => void): Promise<bigint> {
    const sequence = parseAccountSequence(await this.rest(`/cosmos/auth/v1beta1/accounts/${account.cosmosAddress}`));
    const registry = qorechainRegistry();
    const keypair = derivePqcKeypair(account);
    try {
      const params: EthSignParams = {
        account: { privateKey: account.classicalPrivateKey, publicKey: ethers.SigningKey.computePublicKey(account.classicalPrivateKey, true), pqc: keypair },
        chainId: QORECHAIN_CONFIG.cosmosChainId, ...sequence, messages: [message],
        fee: { amount: [{ denom: "uqor", amount: quote.setupFeeCap }], gas: SETUP_GAS_CAP.toString() },
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
      if (gas > SETUP_GAS_CAP || fee > BigInt(quote.setupFeeCap)) {
        throw new Error("Setup gas exceeds the reviewed fee allowance. No further transaction was sent.");
      }
      params.fee = { amount: [{ denom: "uqor", amount: fee.toString() }], gas: gas.toString() };
      const bytes = sign(params).txRawBytes;
      // Hash locally so an uncertain HTTP response still identifies the submitted setup transaction.
      const hash = ethers.sha256(bytes).slice(2).toUpperCase();
      let submitted: any;
      assertUnlocked();
      try {
        submitted = await this.rest("/cosmos/tx/v1beta1/txs", { tx_bytes: ethers.encodeBase64(bytes), mode: "BROADCAST_MODE_SYNC" });
      } catch {
        throw new Error(`Setup broadcast status is unknown. Check transaction ${hash} before retrying.`);
      }
      const result = submitted.tx_response;
      if (!result || Number(result.code) !== 0) throw new Error(result?.raw_log || "QoreChain rejected the setup transaction.");
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        let receipt: any;
        try {
          receipt = (await this.rest(`/cosmos/tx/v1beta1/txs/${hash}`)).tx_response;
        } catch (error: any) {
          if (error.status !== 404) throw new Error(`Could not confirm setup transaction ${hash}. Check its status before retrying.`);
        }
        if (receipt) {
          if (Number(receipt.code) !== 0) throw new Error(`Setup transaction ${hash} failed: ${receipt.raw_log || receipt.code}`);
          if (BigInt(receipt.height || "0") > 0n) return sequence.sequence + 1n;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
      throw new Error(`Setup transaction ${hash} is still pending. Check its status before retrying.`);
    } finally {
      keypair.secretKey.fill(0);
    }
  }

  async send(account: DerivedAccountKeys, quote: QorTransferQuote, assertUnlocked: () => void = () => {}): Promise<string> {
    if (quote.from !== account.classicalAddress || quote.expiresAt < Date.now()) {
      throw new Error("The transfer review expired or the account changed. Review the transfer again.");
    }
    assertUnlocked();
    await this.checkNetwork();
    const balance = BigInt(await this.provider.send("eth_getBalance", [account.classicalAddress, "pending"]));
    if (balance < BigInt(quote.value) + parseEther(quote.maxNetworkFee)) {
      throw new Error("The balance changed since review. Review the transfer again.");
    }
    const status = await this.status(account);
    if (!status.registered) {
      if (!quote.registrationRequired) throw new Error("PQC registration changed. Review the transfer again.");
      const keypair = derivePqcKeypair(account);
      try {
        const message = buildRegisterPqcKeyMsg(account.cosmosAddress, {
          pqcKeypair: keypair,
          ecdsaPubkey: getBytes(ethers.SigningKey.computePublicKey(account.classicalPrivateKey, true)),
          proofOfPossession: signProofOfPossession({ chainId: QORECHAIN_CONFIG.cosmosChainId, account: account.cosmosAddress, keypair }),
        });
        assertUnlocked();
        await this.nativeSend(account, message, true, quote, assertUnlocked);
      } finally {
        keypair.secretKey.fill(0);
      }
      if (!(await this.status(account)).registered) throw new Error("PQC registration is not yet visible. Wait for confirmation before retrying.");
    }
    assertUnlocked();
    const minimumNonce = await this.nativeSend(account, openEvmWindowMsg({
      sender: account.cosmosAddress, blocks: quote.windowBlocks, maxTxs: 1,
      maxValue: quote.windowMaxValue, nativeOnly: true, allowedTargets: [quote.to],
    }), false, quote, assertUnlocked);
    assertUnlocked();
    // Bypass ethers' short-lived request cache: native setup advances the shared nonce.
    let observedNonce = 0n;
    for (let attempt = 0; attempt < 10; attempt++) {
      observedNonce = BigInt(await this.provider.send("eth_getTransactionCount", [account.classicalAddress, "pending"]));
      if (observedNonce >= minimumNonce) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (observedNonce < minimumNonce) throw new Error("The EVM endpoint has not caught up with authorization yet. Wait before reviewing again.");
    const nonce = Number(observedNonce);
    if (!Number.isSafeInteger(nonce)) throw new Error("Invalid transaction nonce from QoreChain.");
    const wallet = new ethers.Wallet(account.classicalPrivateKey, this.provider);
    assertUnlocked();
    const signed = await wallet.signTransaction({
      to: quote.to, value: BigInt(quote.value), gasPrice: BigInt(quote.gasPrice),
      gasLimit: BigInt(quote.gasLimit), nonce, chainId: QORECHAIN_CONFIG.chainId, type: 0,
    });
    assertUnlocked();
    const tx = await this.provider.broadcastTransaction(signed);
    return tx.hash;
  }
}

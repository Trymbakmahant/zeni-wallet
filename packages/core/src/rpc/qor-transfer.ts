import { ethers, formatEther, getBytes, parseEther } from "ethers";
import {
  buildRegisterPqcKeyMsg, openEvmWindowMsg, recommendedGasPriceUqor, signProofOfPossession,
} from "@qorechain/sdk";
import { QORECHAIN_CONFIG } from "../account/constants.js";
import { bech32ToEvmAddress, derivePqcKeypair, type DerivedAccountKeys } from "../crypto/derivation.js";

import { NativeTransactionClient } from "./native-transaction.js";
export { parseAccountSequence } from "./native-transaction.js";

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

/** Native-lane setup followed by an EVM send. Quotes contain no private material. */
export class QorTransferClient extends NativeTransactionClient {
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
        await this.broadcastNative(account, message, true, quote, assertUnlocked);
      } finally {
        keypair.secretKey.fill(0);
      }
      if (!(await this.status(account)).registered) throw new Error("PQC registration is not yet visible. Wait for confirmation before retrying.");
    }
    assertUnlocked();
    const authorization = await this.broadcastNative(account, openEvmWindowMsg({
      sender: account.cosmosAddress, blocks: quote.windowBlocks, maxTxs: 1,
      maxValue: quote.windowMaxValue, nativeOnly: true, allowedTargets: [quote.to],
    }), false, quote, assertUnlocked);
    assertUnlocked();
    // Bypass ethers' short-lived request cache: native setup advances the shared nonce.
    let observedNonce = 0n;
    for (let attempt = 0; attempt < 10; attempt++) {
      observedNonce = BigInt(await this.provider.send("eth_getTransactionCount", [account.classicalAddress, "pending"]));
      if (observedNonce >= authorization.nextSequence) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (observedNonce < authorization.nextSequence) throw new Error("The EVM endpoint has not caught up with authorization yet. Wait before reviewing again.");
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

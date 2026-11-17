import { ethers, parseEther } from "ethers";
import { QORECHAIN_CONFIG } from "../account/constants.js";
import { bank, recommendedGasPriceUqor } from "@qorechain/sdk";
import { bech32ToEvmAddress, evmToBech32Address, type DerivedAccountKeys } from "../crypto/derivation.js";
import { NativeTransactionClient, NATIVE_GAS_CAP, type NativeTxObserver } from "./native-transaction.js";
export { parseAccountSequence } from "./native-transaction.js";

export interface QorTransferQuote {
  id: string;
  kind: "native-qor";
  from: string;
  to: string;
  nativeTo: string;
  amount: string;
  amountUqor: string;
  value: string;
  registrationRequired: boolean;
  setupGasPrice: string;
  setupFeeCap: string;
  maxNetworkFee: string;
  expiresAt: number;
}

/** Registration is a one-time bootstrap; the bank transfer itself is always hybrid signed. */
export class QorTransferClient extends NativeTransactionClient {
  private async balance(account: DerivedAccountKeys): Promise<bigint> {
    const response = await this.rest(`/cosmos/bank/v1beta1/spendable_balances/${account.cosmosAddress}/by_denom?denom=uqor`);
    if (response.balance?.denom !== 'uqor' || !/^\d+$/.test(response.balance?.amount ?? '')) throw new Error('Could not read spendable QOR balance.');
    return BigInt(response.balance.amount);
  }

  async prepare(account: DerivedAccountKeys, recipient: string, amount: string): Promise<QorTransferQuote> {
    if (amount !== 'MAX' && !/^\d+(?:\.\d{1,6})?$/.test(amount)) throw new Error('Native QOR transfers support up to 6 decimal places.');
    let units = amount === 'MAX' ? 0n : ethers.parseUnits(amount, 6);
    if (amount !== 'MAX' && units <= 0n) throw new Error('Enter a QOR amount greater than zero.');
    const target = recipient.trim();
    const to = ethers.getAddress(target.toLowerCase().startsWith('qor1') ? bech32ToEvmAddress(target) : target);
    if (to === ethers.ZeroAddress) throw new Error('The zero address cannot receive this transfer.');
    await this.checkNetwork();
    const [status, code, setupGasPrice, balance] = await Promise.all([
      this.status(account), this.provider.getCode(to),
      recommendedGasPriceUqor({ rest: QORECHAIN_CONFIG.restUrl, fetch: this.fetchImpl }), this.balance(account),
    ]);
    if (code !== '0x') throw new Error('Contract recipients are not supported by native QOR transfers.');
    const price = ethers.parseUnits(setupGasPrice, 12);
    if (price <= 0n) throw new Error('Invalid network fee price.');
    const feeCap = (NATIVE_GAS_CAP * price + 10n ** 12n - 1n) / 10n ** 12n;
    const maxFee = feeCap * (status.registered ? 1n : 2n);
    if (amount === 'MAX') units = balance > maxFee ? balance - maxFee : 0n;
    if (units <= 0n || balance < units + maxFee) throw new Error(`Insufficient QOR for the amount and up to ${ethers.formatUnits(maxFee, 6)} QOR in network/setup fees.`);
    const normalized = ethers.formatUnits(units, 6);
    return {
      id: crypto.randomUUID(), kind: 'native-qor', from: account.classicalAddress, to,
      nativeTo: evmToBech32Address(to), amount: normalized, amountUqor: units.toString(), value: parseEther(normalized).toString(),
      registrationRequired: !status.registered, setupGasPrice, setupFeeCap: feeCap.toString(),
      maxNetworkFee: ethers.formatUnits(maxFee, 6), expiresAt: Date.now() + 120_000,
    };
  }

  async send(account: DerivedAccountKeys, quote: QorTransferQuote, assertUnlocked: () => void = () => {},
    observeRegistration?: NativeTxObserver, observeTransfer?: NativeTxObserver): Promise<string> {
    const check = () => {
      assertUnlocked();
      if (quote.kind !== 'native-qor' || quote.from !== account.classicalAddress || quote.expiresAt <= Date.now()) throw new Error('The transfer review expired or changed. Review the native transfer again.');
    };
    check();
    if (!/^\d+$/.test(quote.amountUqor) || BigInt(quote.amountUqor) <= 0n
      || ethers.parseUnits(quote.amount, 6) !== BigInt(quote.amountUqor)
      || parseEther(quote.amount).toString() !== quote.value
      || evmToBech32Address(ethers.getAddress(quote.to)) !== quote.nativeTo) throw new Error('Invalid native transfer review.');
    await this.checkNetwork();
    if (await this.balance(account) < BigInt(quote.amountUqor) + ethers.parseUnits(quote.maxNetworkFee, 6)) throw new Error('The balance changed since review. Review the transfer again.');
    await this.ensureRegistered(account, quote.registrationRequired, quote, check, observeRegistration);
    check();
    if (await this.provider.getCode(quote.to) !== '0x') throw new Error('Contract recipients are not supported by native QOR transfers.');
    if (await this.balance(account) < BigInt(quote.amountUqor) + BigInt(quote.setupFeeCap)) throw new Error('The balance changed since review. Review the transfer again.');
    check();
    const result = await this.broadcastNative(account, bank.send({
      fromAddress: account.cosmosAddress, toAddress: quote.nativeTo,
      amount: [{ denom: 'uqor', amount: quote.amountUqor }],
    }), false, quote, check, observeTransfer);
    return result.hash;
  }
}

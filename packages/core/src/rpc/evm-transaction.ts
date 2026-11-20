import { ethers } from 'ethers';
import { openEvmWindowMsg, recommendedGasPriceUqor } from '@qorechain/sdk';
import { QORECHAIN_CONFIG } from '../account/constants.js';
import { validateEvmRequest, type EvmIntent } from '../account/evm-request.js';
import type { DerivedAccountKeys } from '../crypto/derivation.js';
import { NativeTransactionClient, NATIVE_GAS_CAP, type NativeTxObserver } from './native-transaction.js';

const WEI_PER_UQOR = 10n ** 12n;
export interface EvmQuote {
  kind: 'evm';
  id: string;
  from: string;
  intent: EvmIntent;
  gasLimit: string;
  type: 0 | 2;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  maxEvmFee: string;
  maxNetworkFee: string;
  setupGasPrice: string;
  setupFeeCap: string;
  registrationRequired: boolean;
  windowBlocks: number;
  windowValueUqor: string;
  expiresAt: number;
}
export interface EvmTxUpdate {
  hash: string;
  status: 'PENDING' | 'FAILED';
  error?: string;
}
export class EvmBroadcastError extends Error {
  constructor(message: string, public readonly hash: string) { super(message); }
}

/** Contract transactions use classical EVM signatures with explicit PQC window authorization. */
export class EvmTransactionClient extends NativeTransactionClient {
  private async spendable(account: DerivedAccountKeys): Promise<bigint> {
    const result = await this.rest(`/cosmos/bank/v1beta1/spendable_balances/${account.cosmosAddress}/by_denom?denom=uqor`);
    if (result.balance?.denom !== 'uqor' || !/^\d+$/.test(result.balance?.amount ?? '')) throw new Error('Could not read spendable QOR balance.');
    const evm = BigInt(await this.provider.send('eth_getBalance', [account.classicalAddress, 'pending']));
    const native = BigInt(result.balance.amount) * WEI_PER_UQOR;
    return evm < native ? evm : native;
  }

  async prepare(account: DerivedAccountKeys, requested: EvmIntent): Promise<EvmQuote> {
    const { kind: _kind, ...fields } = requested;
    const intent = validateEvmRequest([fields], account.classicalAddress);
    await this.checkNetwork();
    const [status, fees, block, setupGasPrice, balance] = await Promise.all([
      this.status(account), this.provider.getFeeData(), this.provider.getBlock('latest'),
      recommendedGasPriceUqor({ rest: QORECHAIN_CONFIG.restUrl, fetch: this.fetchImpl }), this.spendable(account),
    ]);
    const dynamic = intent.type === '0x2' || !!intent.maxFeePerGas || !!intent.maxPriorityFeePerGas;
    const type = dynamic ? 2 : 0;
    const gasPrice = dynamic ? undefined : BigInt(intent.gasPrice ?? fees.gasPrice ?? 0n);
    const maxFeePerGas = dynamic ? BigInt(intent.maxFeePerGas ?? fees.maxFeePerGas ?? 0n) : undefined;
    const maxPriorityFeePerGas = dynamic ? BigInt(intent.maxPriorityFeePerGas ?? fees.maxPriorityFeePerGas ?? 0n) : undefined;
    const price = gasPrice ?? maxFeePerGas!;
    if (price <= 0n || (dynamic && (maxPriorityFeePerGas! > price || (block?.baseFeePerGas ?? 0n) > price))) throw new Error('Invalid or insufficient network fee cap. Request a fresh transaction.');
    const transaction = { from: intent.from, to: intent.to, value: BigInt(intent.value), data: intent.data };
    // Simulation failure/revert blocks approval; never guess a gas limit on failure.
    const estimated = await this.provider.estimateGas(transaction);
    const gasLimit = intent.gas ? BigInt(intent.gas) : (estimated * 12n + 9n) / 10n;
    if (!block || estimated <= 0n || gasLimit < estimated || gasLimit > block.gasLimit || gasLimit > 30_000_000n) throw new Error('The requested gas limit cannot execute this transaction.');
    const setupPrice = ethers.parseUnits(setupGasPrice, 12);
    if (setupPrice <= 0n) throw new Error('Invalid authorization fee price.');
    const setupFeeCap = (NATIVE_GAS_CAP * setupPrice + WEI_PER_UQOR - 1n) / WEI_PER_UQOR;
    const setupTotal = setupFeeCap * (status.registered ? 1n : 2n) * WEI_PER_UQOR;
    const maxEvmFee = gasLimit * price;
    if (balance < BigInt(intent.value) + maxEvmFee + setupTotal) throw new Error('Insufficient QOR for transaction value, EVM gas, and authorization/setup fees.');
    return {
      kind: 'evm', id: crypto.randomUUID(), from: intent.from, intent,
      gasLimit: gasLimit.toString(), type,
      ...(gasPrice !== undefined ? { gasPrice: gasPrice.toString() } : {}),
      ...(dynamic ? { maxFeePerGas: maxFeePerGas!.toString(), maxPriorityFeePerGas: maxPriorityFeePerGas!.toString() } : {}),
      maxEvmFee: ethers.formatEther(maxEvmFee), maxNetworkFee: ethers.formatEther(maxEvmFee + setupTotal),
      setupGasPrice, setupFeeCap: setupFeeCap.toString(), registrationRequired: !status.registered,
      windowBlocks: 120, windowValueUqor: ((BigInt(intent.value) + maxEvmFee + WEI_PER_UQOR - 1n) / WEI_PER_UQOR).toString(),
      expiresAt: Date.now() + 120_000,
    };
  }

  async send(account: DerivedAccountKeys, quote: EvmQuote, assertCurrent: () => void,
    observeSetup: NativeTxObserver, observeEvm: (update: EvmTxUpdate) => Promise<void>): Promise<string> {
    const check = () => {
      assertCurrent();
      if (quote.kind !== 'evm' || quote.from !== account.classicalAddress || quote.expiresAt <= Date.now()) throw new Error('Transaction review expired or account changed. Review again.');
    };
    check();
    await this.checkNetwork();
    if (await this.spendable(account) < BigInt(quote.intent.value) + ethers.parseEther(quote.maxNetworkFee)) throw new Error('Balance changed since review. Review again.');
    await this.ensureRegistered(account, quote.registrationRequired, quote, check, observeSetup);
    check();
    // Consent in the review covers exactly one EVM transaction, bounded in QOR and time.
    // Calls are target-scoped; deployment necessarily has no existing target address.
    await this.broadcastNative(account, openEvmWindowMsg({
      sender: account.cosmosAddress, blocks: quote.windowBlocks, maxTxs: 1,
      maxValue: quote.windowValueUqor, allowedTargets: quote.intent.to ? [quote.intent.to] : [],
    }), false, quote, check, observeSetup);
    check();
    // Native setup increments the shared nonce. Always read it AFTER setup commits.
    const nonceHex = await this.provider.send('eth_getTransactionCount', [account.classicalAddress, 'pending']);
    const nonce = BigInt(nonceHex);
    if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Account nonce exceeds the supported range.');
    const transaction: ethers.TransactionRequest = {
      chainId: QORECHAIN_CONFIG.chainId, type: quote.type, nonce: Number(nonce),
      to: quote.intent.to, data: quote.intent.data, value: BigInt(quote.intent.value), gasLimit: BigInt(quote.gasLimit),
      ...(quote.type === 0 ? { gasPrice: BigInt(quote.gasPrice!) } : { maxFeePerGas: BigInt(quote.maxFeePerGas!), maxPriorityFeePerGas: BigInt(quote.maxPriorityFeePerGas!) }),
    };
    const estimated = await this.provider.estimateGas({ ...transaction, from: account.classicalAddress });
    if (estimated > BigInt(quote.gasLimit)) throw new Error('Gas estimate increased beyond the reviewed limit. Setup fees may have been charged; request a new review.');
    if (await this.spendable(account) < BigInt(quote.intent.value) + ethers.parseEther(quote.maxEvmFee)) throw new Error('Insufficient remaining balance after setup.');
    check();
    const signed = await new ethers.Wallet(account.classicalPrivateKey).signTransaction(transaction);
    const hash = ethers.keccak256(signed);
    check();
    await observeEvm({ hash, status: 'PENDING' });
    try { check(); } catch (error) {
      await observeEvm({ hash, status: 'FAILED', error: 'Cancelled before broadcast.' });
      throw error;
    }
    try {
      const returned = await this.provider.send('eth_sendRawTransaction', [signed]);
      if (typeof returned !== 'string' || returned.toLowerCase() !== hash.toLowerCase()) throw new Error('Unexpected transaction hash.');
      return hash;
    } catch {
      // HTTP/RPC failure can occur after acceptance. Persist the hash; never resend automatically.
      throw new EvmBroadcastError(`Broadcast status is unknown. Check transaction ${hash} in Activity before retrying.`, hash);
    }
  }
}

import { ethers } from "ethers";
import { amm, recommendedGasPriceUqor } from "@qorechain/sdk";
import { AMM_ASSETS, type AmmAsset, QORECHAIN_CONFIG, transactionExplorerUrl } from "../account/constants.js";
import { type DerivedAccountKeys } from "../crypto/derivation.js";
import { NativeTransactionClient, NATIVE_GAS_CAP, type NativeTxUpdate } from "./native-transaction.js";

export interface AmmQuote {
  id: string;
  from: string;
  poolId: string;
  tokenIn: AmmAsset;
  tokenOut: AmmAsset;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  inputUnits: string;
  minOutUnits: string;
  swapFee: string;
  impactBps: number;
  slippageBps: number;
  registrationRequired: boolean;
  setupGasPrice: string;
  setupFeeCap: string;
  maxNetworkFee: string;
  expiresAt: number;
}

export interface SwapResult {
  hash: string;
  status: "CONFIRMED" | "PENDING" | "FAILED";
  stage: "swap" | "registration";
  explorerUrl: string;
  amountOut?: string;
  error?: string;
}

function asset(symbol: string): AmmAsset {
  if (!Object.hasOwn(AMM_ASSETS, symbol)) throw new Error("Unsupported swap token.");
  return symbol as AmmAsset;
}

function uint(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error("Invalid amount returned by QoreChain.");
  return BigInt(value);
}

export function minimumSwapOutput(output: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) throw new Error("Slippage must be between 0.01% and 5%.");
  const minimum = output * BigInt(10_000 - slippageBps) / 10_000n;
  if (minimum <= 0n) throw new Error("The swap output is too small. Increase the input amount.");
  return minimum;
}

/** Sum actual bank-coin receipts for this account, never present a quote as a fill. */
export function swapReceivedAmount(receipt: any, account: string, symbol: AmmAsset): string | undefined {
  let amount = 0n;
  let found = false;
  for (const event of receipt?.events ?? []) {
    if (event.type !== "coin_received") continue;
    const attrs = Object.fromEntries((event.attributes ?? []).map((a: any) => [a.key, a.value]));
    if (attrs.receiver !== account || typeof attrs.amount !== "string") continue;
    for (const coin of attrs.amount.split(",")) {
      const match = /^(\d+)(.+)$/.exec(coin);
      if (match && match[2] === AMM_ASSETS[symbol].denom) { amount += BigInt(match[1]); found = true; }
    }
  }
  return found ? ethers.formatUnits(amount, AMM_ASSETS[symbol].decimals) : undefined;
}

export class AmmSwapClient extends NativeTransactionClient {
  async balances(address: string): Promise<Record<AmmAsset, string>> {
    const amounts: Record<string, bigint> = {};
    let next = "";
    const visited = new Set<string>();
    do {
      if (visited.has(next)) throw new Error("Invalid balance pagination from QoreChain.");
      visited.add(next);
      const page = await this.rest(`/cosmos/bank/v1beta1/spendable_balances/${address}?pagination.limit=200${next ? `&pagination.key=${encodeURIComponent(next)}` : ""}`);
      if (!Array.isArray(page.balances)) throw new Error("Could not read spendable bank balances.");
      for (const coin of page.balances) amounts[coin.denom] = uint(coin.amount);
      next = page.pagination?.next_key || "";
    } while (next);
    return Object.fromEntries(Object.entries(AMM_ASSETS).map(([symbol, config]) => [symbol, ethers.formatUnits(amounts[config.denom] ?? 0n, config.decimals)])) as Record<AmmAsset, string>;
  }

  private async poolQuote(poolId: string, tokenIn: AmmAsset, inputUnits: string) {
    const query = new URLSearchParams({ pool_id: poolId, denom_in: AMM_ASSETS[tokenIn].denom, amount_in: inputUnits });
    const quote = await this.rest(`/qorechain/amm/v1/quote/exact_in?${query}`);
    const output = uint(quote.amount_out);
    const fee = uint(quote.fee);
    if (output <= 0n || !Number.isInteger(quote.impact_bps) || quote.impact_bps < 0) throw new Error("No usable swap quote returned by QoreChain.");
    return { output, fee, impactBps: quote.impact_bps as number };
  }

  async prepareSwap(account: DerivedAccountKeys, input: string, output: string, amount: string, slippageBps: number): Promise<AmmQuote> {
    const tokenIn = asset(input), tokenOut = asset(output);
    if (tokenIn === tokenOut) throw new Error("Choose two different tokens.");
    minimumSwapOutput(10000n, slippageBps);
    await this.checkNetwork();
    const [status, balances, pools, parameters, price] = await Promise.all([
      this.status(account), this.balances(account.cosmosAddress), this.rest("/qorechain/amm/v1/pools"),
      this.rest("/qorechain/amm/v1/params"), recommendedGasPriceUqor({ rest: QORECHAIN_CONFIG.restUrl, fetch: this.fetchImpl }),
    ]);
    if (parameters.params?.enabled !== true) throw new Error("QoreChain swaps are currently disabled.");
    if (!Array.isArray(pools.pools)) throw new Error("Could not read AMM pools.");
    const feeCap = (NATIVE_GAS_CAP * ethers.parseUnits(price, 12) + 10n ** 12n - 1n) / 10n ** 12n;
    const totalFee = feeCap * (status.registered ? 1n : 2n);
    const inputBalance = ethers.parseUnits(balances[tokenIn], AMM_ASSETS[tokenIn].decimals);
    const inputUnits = amount === "MAX" ? inputBalance - (tokenIn === "QOR" ? totalFee : 0n) : ethers.parseUnits(amount, AMM_ASSETS[tokenIn].decimals);
    if (inputUnits <= 0n) throw new Error("Enter an amount greater than zero and leave enough QOR for fees.");
    if (inputUnits > inputBalance) throw new Error(`Insufficient ${tokenIn} bank balance for this swap.`);
    if (ethers.parseUnits(balances.QOR, 6) < totalFee + (tokenIn === "QOR" ? inputUnits : 0n)) throw new Error(`Leave up to ${ethers.formatUnits(totalFee, 6)} QOR for network and setup fees.`);
    const candidates = pools.pools.filter((pool: any) => pool.status === "active"
      && [pool.token_a, pool.token_b].includes(AMM_ASSETS[tokenIn].denom)
      && [pool.token_a, pool.token_b].includes(AMM_ASSETS[tokenOut].denom)
      && uint(pool.reserve_a) > 0n && uint(pool.reserve_b) > 0n);
    if (!candidates.length) throw new Error(`No active direct pool for ${tokenIn} / ${tokenOut}. Choose another pair.`);
    const attempts = await Promise.allSettled(candidates.map(async (pool: any) => ({ pool, quote: await this.poolQuote(pool.id, tokenIn, inputUnits.toString()) })));
    const valid = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? [attempt.value] : []);
    if (!valid.length) throw (attempts[0] as PromiseRejectedResult).reason;
    valid.sort((a, b) => a.quote.output > b.quote.output ? -1 : a.quote.output < b.quote.output ? 1 : 0);
    const best = valid[0];
    if (!Number.isInteger(parameters.params.max_swap_impact_bps) || best.quote.impactBps > parameters.params.max_swap_impact_bps) throw new Error("This trade exceeds the pool's price-impact limit. Try a smaller amount.");
    const minOut = minimumSwapOutput(best.quote.output, slippageBps);
    return {
      id: crypto.randomUUID(), from: account.cosmosAddress, tokenIn, tokenOut, poolId: best.pool.id,
      amountIn: ethers.formatUnits(inputUnits, AMM_ASSETS[tokenIn].decimals), inputUnits: inputUnits.toString(),
      amountOut: ethers.formatUnits(best.quote.output, AMM_ASSETS[tokenOut].decimals),
      minAmountOut: ethers.formatUnits(minOut, AMM_ASSETS[tokenOut].decimals), minOutUnits: minOut.toString(),
      swapFee: ethers.formatUnits(best.quote.fee, AMM_ASSETS[tokenIn].decimals), impactBps: best.quote.impactBps, slippageBps,
      registrationRequired: !status.registered, setupGasPrice: price, setupFeeCap: feeCap.toString(),
      maxNetworkFee: ethers.formatUnits(totalFee, 6), expiresAt: Date.now() + 120_000,
    };
  }

  async executeSwap(account: DerivedAccountKeys, quote: AmmQuote, assertUnlocked: () => void, observe: (update: NativeTxUpdate, stage: "registration" | "swap") => Promise<void>): Promise<SwapResult> {
    const check = () => {
      assertUnlocked();
      if (quote.from !== account.cosmosAddress || Date.now() >= quote.expiresAt) throw new Error("The swap quote expired or the account changed. Review a fresh quote.");
    };
    check();
    await this.checkNetwork();
    const balances = await this.balances(account.cosmosAddress);
    if (ethers.parseUnits(balances[quote.tokenIn], AMM_ASSETS[quote.tokenIn].decimals) < BigInt(quote.inputUnits)
      || ethers.parseUnits(balances.QOR, 6) < ethers.parseUnits(quote.maxNetworkFee, 6) + (quote.tokenIn === "QOR" ? BigInt(quote.inputUnits) : 0n)) throw new Error("Your balance changed. Review the swap again.");
    await this.ensureRegistered(account, quote.registrationRequired, quote, check, (update) => observe(update, "registration"));
    check();
    const fresh = await this.poolQuote(quote.poolId, quote.tokenIn, quote.inputUnits);
    if (fresh.output < BigInt(quote.minOutUnits)) throw new Error("The price moved beyond your slippage limit. Review a fresh quote.");
    const result = await this.broadcastNative(account, amm.swapExactIn({
      sender: account.cosmosAddress, poolId: quote.poolId,
      tokenIn: { denom: AMM_ASSETS[quote.tokenIn].denom, amount: quote.inputUnits },
      denomOut: AMM_ASSETS[quote.tokenOut].denom, minOut: quote.minOutUnits,
    }), false, quote, check, (update) => observe(update, "swap"));
    return { hash: result.hash, status: "CONFIRMED", stage: "swap", explorerUrl: transactionExplorerUrl(result.hash), amountOut: swapReceivedAmount(result.receipt, account.cosmosAddress, quote.tokenOut) };
  }
}

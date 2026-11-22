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

export interface AmmMarket {
  symbol: AmmAsset;
  priceUsd: number;
  liquidityUsd: number;
  poolId: string;
  quote: AmmAsset;
}

/** Price each swap asset in fUSD from on-chain reserves, using its most liquid active pool. */
export function computeMarkets(pools: any[]): AmmMarket[] {
  const byDenom = new Map(Object.entries(AMM_ASSETS).map(([symbol, cfg]) => [cfg.denom, symbol as AmmAsset]));
  const amount = (raw: string, symbol: AmmAsset) => Number(ethers.formatUnits(uint(raw), AMM_ASSETS[symbol].decimals));
  const usable = pools.flatMap((pool) => {
    const a = byDenom.get(pool?.token_a), b = byDenom.get(pool?.token_b);
    if (pool?.status !== "active" || !a || !b) return [];
    const ra = amount(pool.reserve_a, a), rb = amount(pool.reserve_b, b);
    return ra > 0 && rb > 0 ? [{ id: String(pool.id), a, b, ra, rb }] : [];
  });
  const side = (p: typeof usable[number], s: AmmAsset) => p.a === s ? { self: p.ra, other: p.rb, otherSym: p.b } : { self: p.rb, other: p.ra, otherSym: p.a };
  const qorPool = usable.filter((p) => [p.a, p.b].includes("QOR") && [p.a, p.b].includes("fUSD"))
    .sort((x, y) => side(y, "fUSD").self - side(x, "fUSD").self)[0];
  const usd: Partial<Record<AmmAsset, number>> = { fUSD: 1 };
  if (qorPool) { const s = side(qorPool, "QOR"); usd.QOR = s.other / s.self; }
  const markets: AmmMarket[] = [];
  for (const symbol of Object.keys(AMM_ASSETS) as AmmAsset[]) {
    if (symbol === "fUSD") {
      markets.push({ symbol, priceUsd: 1, liquidityUsd: qorPool ? side(qorPool, "fUSD").self * 2 : 0, poolId: qorPool?.id ?? "", quote: "QOR" });
      continue;
    }
    let best: AmmMarket | undefined;
    for (const p of usable) {
      if (![p.a, p.b].includes(symbol)) continue;
      const s = side(p, symbol), otherUsd = usd[s.otherSym];
      if (s.otherSym === symbol || otherUsd === undefined) continue;
      const liquidityUsd = s.other * otherUsd * 2;
      if (!best || liquidityUsd > best.liquidityUsd) best = { symbol, priceUsd: (s.other / s.self) * otherUsd, liquidityUsd, poolId: p.id, quote: s.otherSym };
    }
    if (best) markets.push(best);
  }
  return markets;
}

export interface AmmTrade {
  t: number;
  priceUsd: number;
  amountUsd: number;
  amountIn: string;
  amountOut: string;
  /** Asset this market received in the trade. */
  side: "buy" | "sell";
  txHash: string;
}

export interface AmmMarketHistory {
  symbol: AmmAsset;
  /** Chronological [timestampMs, priceUsd] points from executed swaps in the market's pool. */
  points: [number, number][];
  /** Newest-first executed trades, capped at 25. */
  trades: AmmTrade[];
}

function num(raw: string, symbol: AmmAsset): number {
  return Number(ethers.formatUnits(uint(raw), AMM_ASSETS[symbol].decimals));
}

interface AmmoSwapEvent { t: number; txHash: string; poolId: string; inDenom: string; outDenom: string; inRaw: string; outRaw: string }

interface AmmAnchorEvent { t: number; poolId: string; reserveA: string; reserveB: string }

/** Parse amm_swap events out of indexed swap transactions, newest tx_responses first is fine — we sort. */
export function parseSwapEvents(txResponses: any[]): AmmoSwapEvent[] {
  const events: AmmoSwapEvent[] = [];
  for (const tx of txResponses ?? []) {
    const t = Date.parse(tx?.timestamp ?? "");
    if (!Number.isFinite(t)) continue;
    for (const event of tx?.events ?? []) {
      if (event?.type !== "amm_swap") continue;
      const attrs = Object.fromEntries((event.attributes ?? []).map((a: any) => [a.key, a.value]));
      if (!/^\d+$/.test(attrs.amount_in ?? "") || !/^\d+$/.test(attrs.amount_out ?? "")) continue;
      events.push({
        t, txHash: typeof tx?.txhash === "string" ? tx.txhash : "",
        poolId: String(attrs.pool_id), inDenom: attrs.denom_in, outDenom: attrs.denom_out,
        inRaw: attrs.amount_in, outRaw: attrs.amount_out,
      });
    }
  }
  return events.sort((x, y) => x.t - y.t);
}

const coinAmount = (s: unknown) => /^\d+/.exec(typeof s === "string" ? s : "")?.[0] ?? "";

/** Pool creation and liquidity events expose post-event reserves — exact spot-price anchors. */
export function parseLiquidityEvents(txResponses: any[]): AmmAnchorEvent[] {
  const events: AmmAnchorEvent[] = [];
  for (const tx of txResponses ?? []) {
    const t = Date.parse(tx?.timestamp ?? "");
    if (!Number.isFinite(t)) continue;
    for (const event of tx?.events ?? []) {
      const attrs = Object.fromEntries((event.attributes ?? []).map((a: any) => [a.key, a.value]));
      const created = event?.type === "amm_pool_created";
      const liquidity = event?.type === "amm_liquidity_added" || event?.type === "amm_liquidity_removed";
      if (!created && !liquidity) continue;
      const reserveA = created ? coinAmount(attrs.token_a) : attrs.reserve_a;
      const reserveB = created ? coinAmount(attrs.token_b) : attrs.reserve_b;
      if (!/^\d+$/.test(reserveA ?? "") || !/^\d+$/.test(reserveB ?? "") || attrs.pool_id === undefined) continue;
      events.push({ t, poolId: String(attrs.pool_id), reserveA, reserveB });
    }
  }
  return events;
}

/**
 * Reconstruct per-market USD price history from executed on-chain swaps.
 * Each market uses its currently dominant pool (matching `computeMarkets`). QOR needs a
 * direct fUSD-pool trade to be priced; other assets use a running fUSD or QOR quote rate.
 */
export function computePriceHistory(pools: any[], txResponses: any[]): Partial<Record<AmmAsset, AmmMarketHistory>> {
  const byDenom = new Map<string, AmmAsset>(Object.entries(AMM_ASSETS).map(([symbol, cfg]) => [cfg.denom, symbol as AmmAsset]));
  const poolById = new Map<string, { a: AmmAsset; b: AmmAsset }>();
  for (const pool of pools ?? []) {
    const a = byDenom.get(pool?.token_a), b = byDenom.get(pool?.token_b);
    if (pool?.status !== "active" || !a || !b) continue;
    poolById.set(String(pool.id), { a, b });
  }
  const markets = computeMarkets(pools);
  const history = new Map<AmmAsset, { points: [number, number][]; trades: AmmTrade[] }>();
  for (const m of markets) if (m.poolId) history.set(m.symbol, { points: [], trades: [] });

  const events = parseSwapEvents(txResponses);
  const anchors = parseLiquidityEvents(txResponses);
  const timeline = [
    ...events.map((e) => ({ kind: "swap" as const, ...e })),
    ...anchors.map((e) => ({ kind: "anchor" as const, ...e })),
  ].sort((x, y) => x.t - y.t);

  const quoteUsd: Partial<Record<AmmAsset, number>> = { fUSD: 1 };
  for (const e of timeline) {
    const pool = poolById.get(e.poolId);
    if (!pool) continue;
    const qorPair = [pool.a, pool.b].includes("QOR") && [pool.a, pool.b].includes("fUSD");

    if (e.kind === "anchor") {
      const ra = num(e.reserveA, pool.a), rb = num(e.reserveB, pool.b);
      if (!(ra > 0) || !(rb > 0)) continue;
      if (qorPair) quoteUsd.QOR = pool.a === "QOR" ? rb / ra : ra / rb;
      for (const m of markets) {
        if (e.poolId !== m.poolId) continue;
        const h = history.get(m.symbol);
        if (!h) continue;
        const self = m.symbol === pool.a ? ra : rb, other = m.symbol === pool.a ? rb : ra;
        const quote = m.symbol === pool.a ? pool.b : pool.a;
        const rateUsd = quoteUsd[quote];
        const priceUsd = m.symbol === "fUSD" ? 1 : rateUsd === undefined ? NaN : (other / self) * rateUsd;
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;
        h.points.push([e.t, priceUsd]);
      }
      continue;
    }

    const inSym = byDenom.get(e.inDenom), outSym = byDenom.get(e.outDenom);
    if (!inSym || !outSym) continue;
    const inAmt = num(e.inRaw, inSym), outAmt = num(e.outRaw, outSym);
    if (!(inAmt > 0) || !(outAmt > 0)) continue;
    // Keep the running QOR->fUSD rate fresh from the QOR/fUSD pool.
    if (qorPair) quoteUsd.QOR = inSym === "QOR" ? outAmt / inAmt : inAmt / outAmt;
    for (const m of markets) {
      if (e.poolId !== m.poolId) continue;
      const h = history.get(m.symbol);
      const quote = m.symbol === pool.a ? pool.b : pool.a;
      if (!h) continue;
      const rateUsd = quoteUsd[quote];
      const priceUsd = m.symbol === "fUSD" ? 1 : rateUsd === undefined ? NaN : (m.symbol === inSym ? outAmt / inAmt : inAmt / outAmt) * rateUsd;
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;
      h.points.push([e.t, priceUsd]);
      h.trades.unshift({
        t: e.t, priceUsd,
        amountUsd: inAmt * (quoteUsd[inSym] ?? (inSym === m.symbol ? priceUsd : 0)),
        amountIn: `${inAmt} ${inSym}`, amountOut: `${outAmt} ${outSym}`,
        side: outSym === m.symbol ? "buy" : "sell",
        txHash: e.txHash,
      });
      if (h.trades.length > 25) h.trades.pop();
    }
  }
  return Object.fromEntries(history);
}

export class AmmSwapClient extends NativeTransactionClient {
  private async txSearch(action: string): Promise<any[]> {
    const out: any[] = [];
    let offset = 0;
    while (offset < 1000) {
      const page = await this.rest(`/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(`message.action='/qorechain.amm.v1.${action}'`)}&pagination.limit=100&pagination.offset=${offset}&order_by=ORDER_BY_ASC`);
      const rows = page?.tx_responses;
      if (!Array.isArray(rows) || !rows.length) break;
      out.push(...rows);
      if (rows.length < 100) break;
      offset += 100;
    }
    return out;
  }

  async priceHistory(): Promise<Partial<Record<AmmAsset, AmmMarketHistory>>> {
    const [pools, inTxs, outTxs, addTxs, removeTxs, createTxs] = await Promise.all([
      this.rest("/qorechain/amm/v1/pools?pagination.limit=200"),
      this.txSearch("MsgSwapExactIn"),
      this.txSearch("MsgSwapExactOut"),
      this.txSearch("MsgAddLiquidity"),
      this.txSearch("MsgRemoveLiquidity"),
      this.txSearch("MsgCreatePool"),
    ]);
    if (!Array.isArray(pools.pools)) throw new Error("Could not read AMM pools.");
    return computePriceHistory(pools.pools, [...inTxs, ...outTxs, ...addTxs, ...removeTxs, ...createTxs]);
  }

  async markets(): Promise<AmmMarket[]> {
    const pools = await this.rest("/qorechain/amm/v1/pools?pagination.limit=200");
    if (!Array.isArray(pools.pools)) throw new Error("Could not read AMM pools.");
    return computeMarkets(pools.pools);
  }

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

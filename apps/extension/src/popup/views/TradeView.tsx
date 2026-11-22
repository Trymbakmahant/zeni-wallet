import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, CandlestickChart, RotateCw } from "lucide-react";
import { type AmmAsset, type AmmMarket, type AmmMarketHistory, type AmmTrade } from "@zeni/core";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";
import { SwapForm } from "./SwapModal";

const TOKEN_NAMES: Record<string, string> = {
  QOR: "QoreChain Native",
  fUSD: "Faucet USD",
  fETH: "Faucet Ethereum",
  fBTC: "Faucet Bitcoin",
};

type History = Partial<Record<string, AmmMarketHistory>>;

const formatPrice = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    ...(n >= 1000
      ? { maximumFractionDigits: 0 }
      : n >= 1
        ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { maximumSignificantDigits: 3 }),
  });

const formatCompact = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

const formatAmount = (s: string) => {
  const [n, sym] = s.split(" ");
  const v = Number(n);
  return `${v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v >= 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toLocaleString("en-US", { maximumSignificantDigits: 4 })} ${sym}`;
};

const formatChange = (pct: number) => `${pct >= 0 ? "+" : ""}${pct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

const timeLabel = (t: number, spanMs: number) =>
  new Date(t).toLocaleString(
    "en-US",
    spanMs <= 7 * 24 * 3600_000
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" }
  );

const DAY = 24 * 3600_000;
const RANGES = [
  { id: "1H", ms: 3600_000 },
  { id: "24H", ms: DAY },
  { id: "7D", ms: 7 * DAY },
  { id: "ALL", ms: Infinity },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

type Point = [number, number];

/** Windowed series: carries the last trade before the window, plus the live price at the end. */
function chartSeries(points: Point[], current: number | undefined, rangeMs: number, now: number) {
  const start = rangeMs === Infinity ? -Infinity : now - rangeMs;
  const before = rangeMs === Infinity ? undefined : [...points].reverse().find(([t]) => t <= start);
  const inside = points.filter(([t]) => t > start);
  const first = inside[0]?.[1] ?? before?.[1] ?? current;
  const last = current ?? inside.at(-1)?.[1] ?? first;
  const series: Point[] = inside.length ? inside : [];
  if (series.length < 2) {
    series.unshift([rangeMs === Infinity ? now - 600_000 : start, first ?? 0]);
    if (series.length < 2) series.push([now, last ?? first ?? 0]);
  } else if (current !== undefined && now > inside.at(-1)![0]) {
    series.push([now, current]);
  }
  const change = first && last ? (last / first - 1) * 100 : 0;
  return { series, change };
}

const tone = (change: number) => (change > 0.005 ? "up" : change < -0.005 ? "down" : "flat");
const TONE_COLOR = { up: "#34D399", down: "#FB7185", flat: "#71717A" } as const;

function Sparkline({ series, change }: { series: Point[]; change: number }) {
  const w = 56, h = 22;
  const ys = series.map(([, p]) => p);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || Math.max(max * 0.001, 1e-9);
  const x = (i: number) => (i / Math.max(series.length - 1, 1)) * (w - 2) + 1;
  const y = (p: number) => h - 2 - ((p - min) / span) * (h - 4);
  const d = series.map(([t], i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(series[i][1]).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={TONE_COLOR[tone(change)]} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function PriceChart({ series, span }: { series: Point[]; span: number }) {
  const w = 320, h = 140, padX = 4, padTop = 10, padBottom = 6;
  const ys = series.map(([, p]) => p);
  const min = Math.min(...ys), max = Math.max(...ys);
  const rawSpan = max - min || Math.max(max * 0.002, 1e-9);
  const lo = min - rawSpan * 0.08, hi = max + rawSpan * 0.08;
  const t0 = series[0][0], t1 = series.at(-1)![0];
  const x = (t: number) => padX + ((t - t0) / Math.max(t1 - t0, 1)) * (w - padX * 2);
  const y = (p: number) => padTop + (1 - (p - lo) / (hi - lo)) * (h - padTop - padBottom);
  const line = series.map(([t, p], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${h} L${x(t0).toFixed(1)},${h} Z`;
  const gid = React.useId();
  return (
    <div className="flex flex-col">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E06341" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#E06341" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[min, max].map((p, i) => (
          <line key={i} x1={padX} x2={w - padX} y1={y(p)} y2={y(p)} stroke="#18181B" strokeDasharray="3 4" />
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="#E06341" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {series.length <= 24 && series.map(([t, p], i) => <circle key={i} cx={x(t)} cy={y(p)} r="2" fill="#0D0D10" stroke="#E06341" strokeWidth="1.4" />)}
        <circle cx={x(t1)} cy={y(series.at(-1)![1])} r="3" fill="#E06341" />
      </svg>
      <div className="flex justify-between text-[9px] text-zinc-600 px-1 pt-1 font-mono">
        <span>{timeLabel(t0, span)}</span>
        <span>Low {formatPrice(min)} · High {formatPrice(max)}</span>
        <span>{timeLabel(t1, span)}</span>
      </div>
    </div>
  );
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</span>
    <span className="text-xs font-semibold text-white font-mono truncate">{value}</span>
  </div>
);

const TradeRow: React.FC<{ trade: AmmTrade; symbol: string }> = ({ trade, symbol }) => {
  const marketAmount = trade.amountIn.split(" ")[1] === symbol ? trade.amountIn : trade.amountOut;
  return (
    <div className="flex items-center justify-between py-2 px-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-1.5 h-6 rounded-full shrink-0 ${trade.side === "buy" ? "bg-emerald-400" : "bg-rose-400"}`} />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-white">
            {trade.side === "buy" ? "Buy" : "Sell"} {formatAmount(marketAmount)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">{new Date(trade.t).toLocaleString()}</div>
        </div>
      </div>
      <div className="text-right font-mono shrink-0">
        <div className="text-[11px] font-semibold text-zinc-300">{formatPrice(trade.priceUsd)}</div>
        <div className="text-[10px] text-zinc-600 mt-0.5">{formatCompact(trade.amountUsd)}</div>
      </div>
    </div>
  );
};

const MarketDetail: React.FC<{
  market: AmmMarket;
  history: AmmMarketHistory | undefined;
  onBack: () => void;
  onTrade: () => void;
}> = ({ market, history, onBack, onTrade }) => {
  const [range, setRange] = useState<RangeId>("7D");
  const now = Date.now();
  const points = useMemo(() => history?.points ?? [], [history]);
  const rangeMs = RANGES.find((r) => r.id === range)!.ms;
  const { series, change } = useMemo(
    () => chartSeries(points, market.priceUsd, rangeMs, now),
    [points, market.priceUsd, rangeMs, now]
  );
  const start = rangeMs === Infinity ? -Infinity : now - rangeMs;
  const rangeTrades = (history?.trades ?? []).filter((t) => t.t > start);
  const volumeUsd = rangeTrades.reduce((s, t) => s + t.amountUsd, 0);
  const inRange = series.filter(([t]) => t >= start).map(([, p]) => p);
  const c = tone(change);

  return (
    <div className="flex flex-col pb-3">
      <div className="flex items-center gap-2 pt-1 pb-3">
        <button
          onClick={onBack}
          className="w-7 h-7 rounded-lg bg-[#141416] hover:bg-[#1E1E22] border border-[#222226] flex items-center justify-center text-zinc-300 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <CryptoIcon symbol={market.symbol} className="w-7 h-7" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-white leading-tight">{market.symbol}</div>
          <div className="text-[10px] text-zinc-500">{TOKEN_NAMES[market.symbol] ?? market.symbol}</div>
        </div>
        <button
          onClick={onTrade}
          className="py-1.5 px-4 rounded-full bg-white hover:bg-zinc-200 text-black text-[11px] font-bold transition-colors cursor-pointer"
        >
          Trade
        </button>
      </div>

      <div className="flex items-end gap-2 px-1 pb-2">
        <span className="text-2xl font-bold font-mono text-white leading-none">{formatPrice(market.priceUsd)}</span>
        <span className={`text-[11px] font-semibold mb-px`} style={{ color: TONE_COLOR[c] }}>{formatChange(change)}</span>
      </div>

      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#111114] border border-[#222226] mb-3">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className={`py-1.5 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
              range === r.id ? "bg-white text-black" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {r.id}
          </button>
        ))}
      </div>

      {points.length >= 2 ? (
        <PriceChart series={series} span={rangeMs === Infinity ? t1Span(series) : rangeMs} />
      ) : (
        <div className="py-10 text-center text-xs text-zinc-500 rounded-2xl bg-[#111114] border border-[#222226]">
          Not enough trades yet to chart {market.symbol}.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 p-3 mt-3 rounded-2xl bg-[#111114] border border-[#222226]">
        <Stat label={`Volume ${range}`} value={formatCompact(volumeUsd)} />
        <Stat label="Trades" value={String(rangeTrades.length)} />
        <Stat label="Liquidity" value={formatCompact(market.liquidityUsd)} />
        <Stat label={`High ${range}`} value={inRange.length ? formatPrice(Math.max(...inRange)) : "—"} />
        <Stat label={`Low ${range}`} value={inRange.length ? formatPrice(Math.min(...inRange)) : "—"} />
        <Stat label="Pair" value={`${market.symbol}/${market.quote}`} />
      </div>

      {!!history?.trades.length && (
        <>
          <div className="text-[11px] font-semibold text-zinc-400 px-1 mt-4 mb-1">Recent trades</div>
          <div className="flex flex-col divide-y divide-[#18181B]/60">
            {history.trades.slice(0, 8).map((t, i) => <TradeRow key={`${t.txHash}-${i}`} trade={t} symbol={market.symbol} />)}
          </div>
        </>
      )}

      <p className="text-[10px] text-zinc-600 px-1 pt-3">Prices from executed swaps in pool #{market.poolId} on the Diana AMM.</p>
    </div>
  );
};

const t1Span = (series: Point[]) => series.at(-1)![0] - series[0][0];

type Tab = "swap" | "markets";

export const TradeView: React.FC = () => {
  const { getMarkets, getPriceHistory } = useWallet();
  const [tab, setTab] = useState<Tab>("swap");
  const [pair, setPair] = useState({ in: "QOR", out: "fUSD", key: 0 });
  const [markets, setMarkets] = useState<AmmMarket[] | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AmmMarket | null>(null);

  const loadMarkets = useCallback(async (withHistory = false) => {
    setLoading(true);
    try {
      const jobs: Promise<void>[] = [getMarkets().then((m) => { setMarkets(m); setMarketsError(null); })];
      if (withHistory) jobs.push(getPriceHistory().then(setHistory));
      await Promise.all(jobs);
    } catch (e: any) {
      setMarketsError(e?.message || "Could not load market prices.");
    } finally {
      setLoading(false);
    }
  }, [getMarkets, getPriceHistory]);

  useEffect(() => {
    if (tab !== "markets") return;
    void loadMarkets(history === null);
    const interval = setInterval(() => void loadMarkets(), 30_000);
    return () => clearInterval(interval);
  }, [tab]);

  const tradeAsset = (symbol: AmmAsset | string) => {
    setPair((p) => ({ in: symbol === "QOR" ? "fUSD" : "QOR", out: symbol, key: p.key + 1 }));
    setSelected(null);
    setTab("swap");
  };

  return (
    <div className="flex flex-col pb-3">
      <div className="pt-2 pb-3 px-1 text-[22px] font-bold tracking-tight text-white leading-none">Trade</div>

      {/* Swap | Markets */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#111114] border border-[#222226] mb-3">
        {([
          ["swap", "Swap", ArrowUpDown],
          ["markets", "Markets", CandlestickChart],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSelected(null); }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === id ? "bg-white text-black" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "swap" && (
        <SwapForm
          key={pair.key}
          variant="page"
          initialIn={pair.in}
          initialOut={pair.out}
          onDone={() => setPair((p) => ({ ...p, key: p.key + 1 }))}
        />
      )}

      {tab === "markets" && selected && (
        <MarketDetail
          market={markets?.find((m) => m.symbol === selected.symbol) ?? selected}
          history={history?.[selected.symbol]}
          onBack={() => setSelected(null)}
          onTrade={() => tradeAsset(selected.symbol)}
        />
      )}

      {tab === "markets" && !selected && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live · Diana AMM
            </span>
            <button
              onClick={() => void loadMarkets(true)}
              title="Refresh prices"
              className="p-1 rounded-lg hover:bg-[#141416] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#E06341]" : ""}`} />
            </button>
          </div>

          {marketsError && !markets && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">{marketsError}</div>
          )}

          {!markets && !marketsError && (
            <div className="flex flex-col divide-y divide-[#18181B]/60">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3 px-2 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-[#18181B]" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-16 rounded bg-[#18181B]" />
                    <div className="h-2.5 w-24 rounded bg-[#141416]" />
                  </div>
                  <div className="h-3 w-14 rounded bg-[#18181B]" />
                </div>
              ))}
            </div>
          )}

          {markets && (
            <div className="flex flex-col divide-y divide-[#18181B]/60">
              {markets.map((m) => {
                const spark = history?.[m.symbol]?.points?.length
                  ? chartSeries(history[m.symbol]!.points, m.priceUsd, DAY, Date.now())
                  : null;
                return (
                  <button
                    key={m.symbol}
                    onClick={() => setSelected(m)}
                    className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-[#121215] transition-colors cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CryptoIcon symbol={m.symbol} className="w-9 h-9 shrink-0 transition-transform group-hover:scale-105" />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white leading-tight">{m.symbol}</div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                          {TOKEN_NAMES[m.symbol] ?? m.symbol}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {spark && (
                        <div className="flex flex-col items-end gap-0.5">
                          <Sparkline series={spark.series} change={spark.change} />
                          <span className="text-[9px] font-semibold font-mono" style={{ color: TONE_COLOR[tone(spark.change)] }}>
                            {formatChange(spark.change)}
                          </span>
                        </div>
                      )}
                      <div className="text-right font-mono">
                        <div className="font-bold text-sm text-white leading-tight">{formatPrice(m.priceUsd)}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Liq {formatCompact(m.liquidityUsd)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[10px] text-zinc-600 px-1 pt-3">Testnet prices in fUSD from on-chain pool reserves. Tap a market for its chart.</p>
        </div>
      )}
    </div>
  );
};

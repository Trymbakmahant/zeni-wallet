import React, { useCallback, useEffect, useState } from "react";
import { ArrowUpDown, CandlestickChart, RotateCw } from "lucide-react";
import { type AmmMarket } from "@zeni/core";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";
import { SwapForm } from "./SwapModal";

const TOKEN_NAMES: Record<string, string> = {
  QOR: "QoreChain Native",
  fUSD: "Faucet USD",
  fETH: "Faucet Ethereum",
  fBTC: "Faucet Bitcoin",
};

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

type Tab = "swap" | "markets";

export const TradeView: React.FC = () => {
  const { getMarkets } = useWallet();
  const [tab, setTab] = useState<Tab>("swap");
  const [pair, setPair] = useState({ in: "QOR", out: "fUSD", key: 0 });
  const [markets, setMarkets] = useState<AmmMarket[] | null>(null);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    try {
      setMarkets(await getMarkets());
      setMarketsError(null);
    } catch (e: any) {
      setMarketsError(e?.message || "Could not load market prices.");
    } finally {
      setLoading(false);
    }
  }, [getMarkets]);

  useEffect(() => {
    if (tab !== "markets") return;
    void loadMarkets();
    const interval = setInterval(loadMarkets, 30_000);
    return () => clearInterval(interval);
  }, [tab]);

  const tradeAsset = (symbol: string) => {
    setPair((p) => ({ in: symbol === "QOR" ? "fUSD" : "QOR", out: symbol, key: p.key + 1 }));
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
            onClick={() => setTab(id)}
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

      {tab === "markets" && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live · Diana AMM
            </span>
            <button
              onClick={() => void loadMarkets()}
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
              {markets.map((m) => (
                <button
                  key={m.symbol}
                  onClick={() => tradeAsset(m.symbol)}
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
                    <div className="text-right font-mono">
                      <div className="font-bold text-sm text-white leading-tight">{formatPrice(m.priceUsd)}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">Liq {formatCompact(m.liquidityUsd)}</div>
                    </div>
                    <span className="py-1 px-3 rounded-full bg-white group-hover:bg-zinc-200 text-black text-[11px] font-bold transition-colors">
                      Trade
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-[10px] text-zinc-600 px-1 pt-3">Testnet prices in fUSD from on-chain pool reserves.</p>
        </div>
      )}
    </div>
  );
};

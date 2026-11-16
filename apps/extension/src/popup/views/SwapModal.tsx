import React, { useState } from "react";
import { X, ArrowUpDown, Fuel, ShieldCheck, CheckCircle2, Settings2, ChevronDown, Check, AlertCircle } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";

export const SwapModal: React.FC = () => {
  const { openModal, tokens, executeSwap } = useWallet();
  const [tokenIn, setTokenIn] = useState("QOR");
  const [tokenOut, setTokenOut] = useState("fUSD");
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [showSettings, setShowSettings] = useState(false);
  const [selectingTokenFor, setSelectingTokenFor] = useState<"in" | "out" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rate calculator based on testnet pools
  const getRate = (from: string, to: string): number => {
    if (from === to) return 1.0;
    const rates: Record<string, number> = {
      QOR: 2.0,      // 1 QOR = 2 fUSD
      fUSD: 1.0,     // 1 fUSD = 1 USD
      fETH: 3100.0,  // 1 fETH = 3100 fUSD
      fBTC: 65000.0, // 1 fBTC = 65000 fUSD
    };
    const fromUsd = rates[from] || 1;
    const toUsd = rates[to] || 1;
    return fromUsd / toUsd;
  };

  const rate = getRate(tokenIn, tokenOut);
  const amountOut = amountIn ? (parseFloat(amountIn) * rate).toFixed(4) : "0.00";
  const activeInToken = tokens.find((t) => t.symbol === tokenIn) || tokens[0];

  const handleSwitch = () => {
    const temp = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(temp);
  };

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountIn || parseFloat(amountIn) <= 0) return;

    if (parseFloat(amountIn) > parseFloat(activeInToken.balance)) {
      setError("Insufficient balance");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const hash = await executeSwap(tokenIn, tokenOut, amountIn, amountOut);
      setTxHash(hash);
      setTimeout(() => {
        openModal(null);
      }, 2500);
    } catch (err: any) {
      setError(err?.message || "Swap failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex flex-col justify-end">
      <div className="relative bg-[#0D0D10] border-t border-[#222226] rounded-t-3xl p-5 w-full max-h-[92%] flex flex-col overflow-y-auto overflow-x-hidden animate-slide-up">
        {/* Custom Token Selection Drawer */}
        {selectingTokenFor && (
          <div className="absolute inset-0 bg-[#0D0D10] z-30 flex flex-col p-5 rounded-t-3xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#222226]">
              <div>
                <h3 className="font-bold text-base text-white">Select a Token</h3>
                <span className="text-[11px] text-zinc-400">
                  Choose token to {selectingTokenFor === "in" ? "pay" : "receive"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectingTokenFor(null)}
                className="w-7 h-7 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center text-zinc-400 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-1.5 pr-0.5">
              {tokens.map((token) => {
                const isSelected = selectingTokenFor === "in" ? tokenIn === token.symbol : tokenOut === token.symbol;
                const isOpposite = selectingTokenFor === "in" ? tokenOut === token.symbol : tokenIn === token.symbol;

                return (
                  <button
                    key={token.symbol}
                    type="button"
                    disabled={isOpposite}
                    onClick={() => {
                      if (selectingTokenFor === "in") {
                        setTokenIn(token.symbol);
                      } else {
                        setTokenOut(token.symbol);
                      }
                      setSelectingTokenFor(null);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#18181C] border border-[#E06341]/50 shadow-sm"
                        : isOpposite
                        ? "opacity-35 cursor-not-allowed border border-transparent"
                        : "hover:bg-[#18181C] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CryptoIcon symbol={token.symbol} className="w-9 h-9 shrink-0" />
                      <div className="text-left">
                        <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                          <span>{token.symbol}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#E06341]" />}
                        </div>
                        <div className="text-[11px] text-zinc-400">{token.name}</div>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-sm text-white">{token.balance}</div>
                      <div className="text-[11px] text-zinc-500">{token.usdValue}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222226]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E06341]/15 flex items-center justify-center text-[#E06341]">
              <ArrowUpDown className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight text-white">In-Wallet Swap</h2>
              <span className="text-[10px] text-zinc-400">Uniswap v2 AMM Pools</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-7 h-7 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center text-zinc-400 cursor-pointer"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => openModal(null)}
              className="w-7 h-7 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center text-zinc-400 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Slippage Settings Drawer */}
        {showSettings && (
          <div className="p-3 my-2 bg-black rounded-xl border border-[#222226] text-xs">
            <span className="text-zinc-400 block mb-1 font-semibold">Slippage Tolerance</span>
            <div className="flex gap-2">
              {["0.1", "0.5", "1.0"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlippage(s)}
                  className={`px-3 py-1 rounded-lg border font-mono transition-colors ${
                    slippage === s
                      ? "bg-[#E06341] border-[#E06341] text-white"
                      : "bg-[#18181C] border-[#222226] text-zinc-300"
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>
        )}

        {txHash ? (
          <div className="py-10 flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#E06341]/20 text-[#E06341] flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Swap Executed!</h3>
            <p className="text-xs text-zinc-400 max-w-xs font-mono break-all">
              Tx: {txHash.slice(0, 16)}...{txHash.slice(-8)}
            </p>
            <div className="text-[11px] text-[#E06341] bg-[#E06341]/10 px-3 py-1 rounded-full border border-[#E06341]/25 font-mono">
              Network Fee Paid • Routed via Uniswap v2
            </div>
          </div>
        ) : (
          <form onSubmit={handleSwap} className="space-y-3 pt-4 flex-1 flex flex-col min-w-0 max-w-full">
            {error && (
              <div className="w-full max-w-full overflow-hidden p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2.5 shadow-sm">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 break-words break-all leading-relaxed">
                  {error}
                </div>
              </div>
            )}

            {/* Token In */}
            <div className="p-3.5 rounded-2xl bg-black border border-[#222226]">
              <div className="flex justify-between items-center text-xs text-zinc-400 mb-1">
                <span>You Pay</span>
                <span>Balance: {activeInToken.balance}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  required
                  className="w-full bg-transparent text-xl font-bold font-mono focus:outline-none text-white"
                />
                <button
                  type="button"
                  onClick={() => setSelectingTokenFor("in")}
                  className="flex items-center gap-2 bg-[#18181C] hover:bg-[#222226] border border-[#27272A] rounded-2xl px-3 py-1.5 shrink-0 transition-all hover:scale-[1.02] cursor-pointer group"
                >
                  <CryptoIcon symbol={tokenIn} className="w-5 h-5 shrink-0" />
                  <span className="font-bold text-sm text-white">{tokenIn}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
                </button>
              </div>
            </div>

            {/* Switch Button */}
            <div className="flex justify-center -my-2 z-10">
              <button
                type="button"
                onClick={handleSwitch}
                className="w-8 h-8 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center border border-[#27272A] text-[#E06341] transition-transform hover:rotate-180 shadow-md cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            {/* Token Out */}
            <div className="p-3.5 rounded-2xl bg-black border border-[#222226]">
              <div className="flex justify-between items-center text-xs text-zinc-400 mb-1">
                <span>You Receive (Estimated)</span>
                <span>Slippage: {slippage}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-full text-xl font-bold font-mono text-white">{amountOut}</div>
                <button
                  type="button"
                  onClick={() => setSelectingTokenFor("out")}
                  className="flex items-center gap-2 bg-[#18181C] hover:bg-[#222226] border border-[#27272A] rounded-2xl px-3 py-1.5 shrink-0 transition-all hover:scale-[1.02] cursor-pointer group"
                >
                  <CryptoIcon symbol={tokenOut} className="w-5 h-5 shrink-0" />
                  <span className="font-bold text-sm text-white">{tokenOut}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
                </button>
              </div>
            </div>

            <div className="flex justify-between text-[11px] text-zinc-400 px-1 pt-1">
              <span>Exchange Rate</span>
              <span>1 {tokenIn} ≈ {rate.toFixed(4)} {tokenOut}</span>
            </div>

            {/* Network Gas Fee Badge */}
            <div className="p-2.5 rounded-xl bg-[#141418] border border-[#222226] flex items-center justify-between text-xs text-zinc-300">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Fuel className="w-4 h-4 text-[#E06341]" />
                <span>Est. Network Fee</span>
              </div>
              <span className="font-mono font-medium text-white">~0.0030 QOR</span>
            </div>

            <div className="pt-2 mt-auto">
              <button
                type="submit"
                disabled={isSubmitting || !amountIn || parseFloat(amountIn) <= 0}
                className="w-full py-3.5 rounded-xl bg-[#E06341] hover:bg-[#EB6841] text-white font-semibold text-sm shadow-xl shadow-[#E06341]/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Executing Gasless Swap...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Execute Gasless Swap</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

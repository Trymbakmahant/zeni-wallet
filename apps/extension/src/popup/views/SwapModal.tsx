import React, { useState } from "react";
import { X, ArrowUpDown, Flame, ShieldCheck, CheckCircle2, Settings2 } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";

export const SwapModal: React.FC = () => {
  const { openModal, tokens, executeSwap } = useWallet();
  const [tokenIn, setTokenIn] = useState("QOR");
  const [tokenOut, setTokenOut] = useState("fUSD");
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [showSettings, setShowSettings] = useState(false);
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col justify-end">
      <div className="bg-[#141824] border-t border-[#20283E] rounded-t-3xl p-5 w-full max-h-[92%] flex flex-col overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#20283E]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#00F0FF]/20 flex items-center justify-center text-[#00F0FF]">
              <ArrowUpDown className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">In-Wallet Swap</h2>
              <span className="text-[10px] text-[#8892B0]">Uniswap v2 AMM Pools</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-7 h-7 rounded-full bg-[#20283E] hover:bg-[#2A3450] flex items-center justify-center text-gray-400"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => openModal(null)}
              className="w-7 h-7 rounded-full bg-[#20283E] hover:bg-[#2A3450] flex items-center justify-center text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Slippage Settings Drawer */}
        {showSettings && (
          <div className="p-3 my-2 bg-[#0B0E14] rounded-xl border border-[#20283E] text-xs">
            <span className="text-[#8892B0] block mb-1 font-semibold">Slippage Tolerance</span>
            <div className="flex gap-2">
              {["0.1", "0.5", "1.0"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlippage(s)}
                  className={`px-3 py-1 rounded-lg border font-mono transition-colors ${
                    slippage === s
                      ? "bg-[#9939FF] border-[#9939FF] text-white"
                      : "bg-[#141824] border-[#20283E] text-gray-300"
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
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold">Swap Executed!</h3>
            <p className="text-xs text-[#8892B0] max-w-xs font-mono break-all">
              Tx: {txHash.slice(0, 16)}...{txHash.slice(-8)}
            </p>
            <div className="text-[11px] text-[#00F0FF] bg-[#00F0FF]/10 px-3 py-1 rounded-full border border-[#00F0FF]/25 font-mono">
              Gas Sponsored • Routed via Uniswap v2
            </div>
          </div>
        ) : (
          <form onSubmit={handleSwap} className="space-y-3 pt-4 flex-1 flex flex-col">
            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* Token In */}
            <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#20283E]">
              <div className="flex justify-between items-center text-xs text-[#8892B0] mb-1">
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
                <div className="flex items-center bg-[#20283E] rounded-xl px-2.5 py-1.5 shrink-0">
                  <CryptoIcon symbol={tokenIn} className="w-5 h-5 mr-1.5 shrink-0" />
                  <select
                    value={tokenIn}
                    onChange={(e) => setTokenIn(e.target.value)}
                    className="bg-transparent text-sm font-semibold focus:outline-none text-white cursor-pointer"
                  >
                    {tokens.map((t) => (
                      <option key={t.symbol} value={t.symbol} disabled={t.symbol === tokenOut} className="bg-[#141824] text-white">
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Switch Button */}
            <div className="flex justify-center -my-2 z-10">
              <button
                type="button"
                onClick={handleSwitch}
                className="w-8 h-8 rounded-full bg-[#20283E] hover:bg-[#2A3450] flex items-center justify-center border border-[#303C5C] text-[#00F0FF] transition-transform hover:rotate-180 shadow-md"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            {/* Token Out */}
            <div className="p-3.5 rounded-2xl bg-[#0B0E14] border border-[#20283E]">
              <div className="flex justify-between items-center text-xs text-[#8892B0] mb-1">
                <span>You Receive (Estimated)</span>
                <span>Slippage: {slippage}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-full text-xl font-bold font-mono text-[#00F0FF]">{amountOut}</div>
                <div className="flex items-center bg-[#20283E] rounded-xl px-2.5 py-1.5 shrink-0">
                  <CryptoIcon symbol={tokenOut} className="w-5 h-5 mr-1.5 shrink-0" />
                  <select
                    value={tokenOut}
                    onChange={(e) => setTokenOut(e.target.value)}
                    className="bg-transparent text-sm font-semibold focus:outline-none text-white cursor-pointer"
                  >
                    {tokens.map((t) => (
                      <option key={t.symbol} value={t.symbol} disabled={t.symbol === tokenIn} className="bg-[#141824] text-white">
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-between text-[11px] text-[#8892B0] px-1 pt-1">
              <span>Exchange Rate</span>
              <span>1 {tokenIn} ≈ {rate.toFixed(4)} {tokenOut}</span>
            </div>

            {/* Paymaster sponsorship badge */}
            <div className="p-2.5 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-between text-xs text-[#00F0FF]">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4" />
                <span>Gas Fee</span>
              </div>
              <span className="font-mono font-bold">0.00 QOR (Sponsored)</span>
            </div>

            <div className="pt-2 mt-auto">
              <button
                type="submit"
                disabled={isSubmitting || !amountIn || parseFloat(amountIn) <= 0}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#00F0FF] text-white font-semibold text-sm shadow-xl shadow-[#00F0FF]/15 disabled:opacity-50 hover:opacity-95 transition-all flex items-center justify-center gap-2"
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

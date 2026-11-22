import React, { useState, useEffect, useRef } from "react";
import { X, ArrowUpDown, Fuel, ShieldCheck, CheckCircle2, Settings2, ChevronDown, Check, AlertCircle, ExternalLink } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";
import { type AmmQuote, type SwapResult } from "@zeni/core";

interface SwapFormProps {
  variant?: "modal" | "page";
  initialIn?: string;
  initialOut?: string;
  onDone?: () => void;
}

export const SwapForm: React.FC<SwapFormProps> = ({ variant = "modal", initialIn = "QOR", initialOut = "fUSD", onDone }) => {
  const { openModal, tokens, prepareSwap, executeSwap } = useWallet();
  const isPage = variant === "page";
  const done = onDone ?? (() => openModal(null));
  const cardBg = isPage ? "bg-[#111114]" : "bg-black";
  const [tokenIn, setTokenIn] = useState(initialIn);
  const [tokenOut, setTokenOut] = useState(initialOut);
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [showSettings, setShowSettings] = useState(false);
  const [selectingTokenFor, setSelectingTokenFor] = useState<"in" | "out" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [quote, setQuote] = useState<AmmQuote | null>(null);
  const [reviewedQuote, setReviewedQuote] = useState<AmmQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeInToken = tokens.find((t) => t.symbol === tokenIn) || tokens[0] || { balance: "0" };
  const activeQuote = reviewedQuote || quote;
  const currentInputs = useRef("");
  currentInputs.current = [tokenIn, tokenOut, amountIn, slippage].join("|");

  useEffect(() => {
    if (reviewedQuote || isSubmitting || result) return;
    let cancelled = false;
    let running = false;
    setQuote(null);
    setError(null);
    if (!amountIn || !(Number(amountIn) > 0)) { setIsQuoting(false); return; }
    setIsQuoting(true);
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const next = await prepareSwap(tokenIn, tokenOut, amountIn, Math.round(Number(slippage) * 100));
        if (!cancelled) { setQuote(next); setError(null); }
      } catch (err: any) {
        if (!cancelled) { setQuote(null); setError(err.message || "Could not fetch a live quote"); }
      } finally {
        running = false;
        if (!cancelled) setIsQuoting(false);
      }
    };
    const timer = setTimeout(refresh, 400);
    const interval = setInterval(refresh, 20_000);
    return () => { cancelled = true; clearTimeout(timer); clearInterval(interval); };
  }, [tokenIn, tokenOut, amountIn, slippage, reviewedQuote, isSubmitting, result]);

  const handleSwitch = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); };
  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuote || isSubmitting) return;
    if (!reviewedQuote) { setActionError(null); setReviewedQuote(activeQuote); return; }
    setIsSubmitting(true);
    setError(null);
    setActionError(null);
    try { setResult(await executeSwap(reviewedQuote.id)); }
    catch (err: any) {
      setReviewedQuote(null);
      setQuote(null);
      setActionError(err.message || "Swap failed. Check Activity for any completed setup transactions.");
    } finally { setIsSubmitting(false); }
  };

  const handleMax = async () => {
    const inputs = currentInputs.current;
    setIsQuoting(true);
    setError(null);
    try {
      const maximum = await prepareSwap(tokenIn, tokenOut, "MAX", Math.round(Number(slippage) * 100));
      if (currentInputs.current !== inputs) return;
      setAmountIn(maximum.amountIn);
      setReviewedQuote(maximum);
    } catch (err: any) { setError(err.message); }
    finally { setIsQuoting(false); }
  };

  const body = (
      <div className={isPage
        ? "relative flex flex-col min-h-[440px]"
        : "relative bg-[#0D0D10] border-t border-[#222226] rounded-t-3xl p-5 w-full max-h-[92%] flex flex-col overflow-y-auto overflow-x-hidden animate-slide-up"}>
        {/* Custom Token Selection Drawer */}
        {selectingTokenFor && (
          <div className={`absolute inset-0 z-30 flex flex-col animate-fade-in ${isPage ? "bg-black" : "bg-[#0D0D10] p-5 rounded-t-3xl"}`}>
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
        {isPage ? (
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> QoreChain native AMM
            </span>
            <button
              type="button"
              disabled={isSubmitting || !!reviewedQuote}
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#141416] text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" /> {slippage}%
            </button>
          </div>
        ) : (
        <div className="flex items-center justify-between pb-3 border-b border-[#222226]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E06341]/15 flex items-center justify-center text-[#E06341]">
              <ArrowUpDown className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight text-white">In-Wallet Swap</h2>
              <span className="text-[10px] text-zinc-400">QoreChain native AMM · Testnet</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={isSubmitting || !!reviewedQuote}
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
        )}

        {/* Slippage Settings Drawer */}
        {showSettings && (
          <div className="p-3 my-2 bg-black rounded-xl border border-[#222226] text-xs">
            <span className="text-zinc-400 block mb-1 font-semibold">Slippage Tolerance</span>
            <div className="flex gap-2">
              {["0.1", "0.5", "1.0"].map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={isSubmitting || !!reviewedQuote}
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

        {result ? (
          <div className="py-8 flex flex-col items-center text-center space-y-4">
            {result.status === "CONFIRMED" ? <CheckCircle2 className="w-12 h-12 text-[#E06341]" /> : <AlertCircle className="w-12 h-12 text-[#E06341]" />}
            <h3 className="text-lg font-bold text-white">
              {result.stage === "registration" ? "PQC Setup" : "Swap"} {result.status === "CONFIRMED" ? "Confirmed" : result.status === "FAILED" ? "Failed" : "Pending"}
            </h3>
            {result.amountOut && <p className="text-sm text-white">Received {result.amountOut} {tokenOut}</p>}
            {result.error && <p className="text-xs text-zinc-400 break-all">{result.error}</p>}
            <p className="text-[11px] font-mono text-zinc-400 break-all select-text">{result.hash}</p>
            <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="w-full py-3 rounded-xl bg-[#E06341] text-white text-sm font-semibold flex items-center justify-center gap-2">
              View on Explorer <ExternalLink className="w-4 h-4" />
            </a>
            <p className="text-[11px] text-zinc-400">Select Testnet in the explorer. This transaction is also saved in Activity.</p>
            <button type="button" onClick={done} className="text-sm text-white py-2">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSwap} className={`space-y-3 flex-1 ${isPage ? "pt-2" : "pt-4"} flex flex-col min-w-0 max-w-full`}>
            {(actionError || error) && (
              <div className="w-full max-w-full overflow-hidden p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2.5 shadow-sm">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 break-words break-all leading-relaxed">
                  {actionError || error}
                </div>
              </div>
            )}

            {/* Token In */}
            <div className={`p-3.5 rounded-2xl ${cardBg} border border-[#222226]`}>
              <div className="flex justify-between items-center text-xs text-zinc-400 mb-1">
                <span>You Pay</span>
                <span className="text-right break-all">Balance: {activeInToken.balance} <button type="button" disabled={isSubmitting || isQuoting || !!reviewedQuote} onClick={handleMax} className="text-[#E06341] ml-1">MAX</button></span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="0.0"
                  value={amountIn}
                  disabled={isSubmitting || !!reviewedQuote}
                  onChange={(e) => setAmountIn(e.target.value)}
                  required
                  className="w-full bg-transparent text-xl font-bold font-mono focus:outline-none text-white"
                />
                <button
                  type="button"
                  disabled={isSubmitting || !!reviewedQuote}
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
                disabled={isSubmitting || !!reviewedQuote}
                onClick={handleSwitch}
                className="w-8 h-8 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center border border-[#27272A] text-[#E06341] transition-transform hover:rotate-180 shadow-md cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            {/* Token Out */}
            <div className={`p-3.5 rounded-2xl ${cardBg} border border-[#222226]`}>
              <div className="flex justify-between items-center text-xs text-zinc-400 mb-1">
                <span>You Receive (Estimated)</span>
                {!isPage && <span>Slippage: {slippage}%</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-full text-xl font-bold font-mono text-white">{activeQuote?.amountOut || (isQuoting ? "…" : "—")}</div>
                <button
                  type="button"
                  disabled={isSubmitting || !!reviewedQuote}
                  onClick={() => setSelectingTokenFor("out")}
                  className="flex items-center gap-2 bg-[#18181C] hover:bg-[#222226] border border-[#27272A] rounded-2xl px-3 py-1.5 shrink-0 transition-all hover:scale-[1.02] cursor-pointer group"
                >
                  <CryptoIcon symbol={tokenOut} className="w-5 h-5 shrink-0" />
                  <span className="font-bold text-sm text-white">{tokenOut}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
                </button>
              </div>
            </div>

            {activeQuote && (
              <div className="p-3 rounded-xl bg-[#141418] border border-[#222226] text-xs text-zinc-300 space-y-2">
                <div className="flex justify-between gap-2"><span>Pool</span><span>#{activeQuote.poolId} · {tokenIn}/{tokenOut}</span></div>
                <div className="flex justify-between gap-2"><span>Minimum received</span><span className="text-right break-all">{activeQuote.minAmountOut} {tokenOut}</span></div>
                <div className="flex justify-between gap-2"><span>Swap fee (included)</span><span>{activeQuote.swapFee} {tokenIn}</span></div>
                <div className="flex justify-between gap-2"><span>Price impact</span><span>{(activeQuote.impactBps / 100).toFixed(2)}%</span></div>
                <div className="flex justify-between gap-2"><span><Fuel className="inline w-3 h-3 mr-1" />Network fee allowance</span><span>Up to {activeQuote.maxNetworkFee} QOR</span></div>
                {activeQuote.registrationRequired && <p className="text-zinc-400">Includes first-time PQC key registration. Completed setup fees remain charged if the swap fails.</p>}
                <p className="text-[11px] text-zinc-500">Uses native bank balances. Quotes refresh until you review.</p>
                {reviewedQuote && <button type="button" disabled={isSubmitting} onClick={() => { setReviewedQuote(null); setError(null); setActionError(null); }} className="text-[#E06341]">Edit / refresh quote</button>}
              </div>
            )}

            <div className={isPage ? "pt-1" : "sticky bottom-0 z-10 bg-[#0D0D10] pt-3 pb-1 mt-auto"}>
              <button
                type="submit"
                disabled={isSubmitting || !activeQuote || isQuoting}
                className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed ${isPage
                  ? "bg-[#E06341] hover:bg-[#EB6841] text-white disabled:bg-[#18181B] disabled:text-zinc-500"
                  : "bg-[#E06341] hover:bg-[#EB6841] text-white shadow-xl shadow-[#E06341]/20 disabled:opacity-50"}`}
              >
                {isSubmitting ? (
                  <span>Signing & confirming swap…</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isQuoting ? "Getting live quote…" : reviewedQuote ? "Confirm & Swap" : "Review Swap"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
  );

  return isPage ? body : (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex flex-col justify-end">{body}</div>
  );
};

export const SwapModal: React.FC = () => <SwapForm />;

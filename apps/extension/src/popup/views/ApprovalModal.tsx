import React, { useEffect, useState } from "react";
import { Globe, Check, X, LoaderCircle } from "lucide-react";
import type { QorTransferQuote } from "@zeni/core";
import { useWallet, type PendingApproval } from "../context/WalletContext";

export const ApprovalModal: React.FC = () => {
  const { pendingApprovals } = useWallet();
  const current = pendingApprovals[0];
  return current ? <ApprovalReview key={current.internalId} current={current} /> : null;
};

function ApprovalReview({ current }: { current: PendingApproval }) {
  const { resolveApproval, activeAddress } = useWallet();
  const [quote, setQuote] = useState<QorTransferQuote | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0), [now, setNow] = useState(Date.now());
  const isConnect = current.payload.method === "eth_requestAccounts";
  const intent = current.intent;
  useEffect(() => {
    if (intent?.kind !== "transfer") return;
    let disposed = false;
    setLoading(true); setError(null); setQuote(null);
    const timeout = setTimeout(() => {
      disposed = true;
      setLoading(false);
      setError("Fee calculation timed out. Retry fee review to continue.");
    }, 30_000);
    chrome.runtime.sendMessage({ type: "PREPARE_DAPP_APPROVAL", internalId: current.internalId }, response => {
      const transportError = chrome.runtime.lastError?.message;
      if (disposed) return;
      clearTimeout(timeout);
      setLoading(false);
      if (transportError || !response?.success) setError(transportError || response?.error || "Could not calculate fees.");
      else setQuote(response.data);
    });
    return () => { disposed = true; clearTimeout(timeout); };
  }, [current.internalId, intent?.kind, attempt]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = !!quote && quote.expiresAt <= now;
  const unavailable = !isConnect && !intent;
  const needsReview = intent?.kind === "transfer" && (loading || !quote || expired || !!error);
  const canApprove = !busy && !unavailable && !needsReview;
  async function decide(approved: boolean) {
    if (busy || (approved && !canApprove)) return;
    setBusy(true); setError(null);
    try { await resolveApproval(current.internalId, approved, quote?.id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Request failed. Check Activity before retrying."); }
    finally { setBusy(false); }
  }
  const detailClass = "p-3.5 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2 text-xs";
  return <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex flex-col p-5 text-white animate-fade-in">
    <div className="flex-1 min-h-0 overflow-y-auto pb-4">
      <div className="flex flex-col items-center pt-2 pb-4 text-center border-b border-[#222226]">
        <Globe className="w-8 h-8 text-[#E06341] mb-2" />
        <h2 className="font-bold text-base break-words w-full">{current.title || "External Application"}</h2>
        <span className="text-xs font-mono text-[#E06341] break-all">{current.origin}</span>
      </div>
      <h3 className="font-semibold my-4">{isConnect ? "Connect account" : intent?.kind === "message" ? "Sign message" : "Review QOR transfer"}</h3>
      <p className="text-xs text-zinc-400 mb-3">QoreChain Diana testnet · Chain 9800</p>
      <div className={detailClass}><span className="text-zinc-400">Account</span><p className="font-mono break-all">{current.account || activeAddress}</p></div>
      {isConnect && <p className="text-xs text-zinc-400 mt-3">This website can see your account address and request signatures or transfers. Each request needs your approval.</p>}
      {intent?.kind === "message" && <div className="mt-3 space-y-3"><p className="text-xs text-zinc-400">Sign only if you understand and trust the complete message below. Signing a message costs no network fee.</p><pre dir="auto" className={`${detailClass} whitespace-pre-wrap break-words font-mono`}>{intent.text}</pre></div>}
      {intent?.kind === "transfer" && <div className="mt-3 space-y-3">
        <div className={detailClass}><span className="text-zinc-400">Recipient</span><p className="font-mono break-all">{intent.to}</p><span className="text-zinc-400 block pt-2">Amount</span><p className="font-semibold">{intent.amount} QOR</p></div>
        {quote && <div className={detailClass}><p>Maximum network and setup fees: <strong>{quote.maxNetworkFee} QOR</strong></p><p className="text-zinc-400">This native transfer is signed with both your classical and post-quantum keys.</p><p className="font-mono break-all">{quote.nativeTo}</p>{quote.registrationRequired && <p className="text-zinc-400">First-time key registration uses your classical key and proof of possession before the hybrid-signed transfer.</p>}<p className="text-zinc-400">Setup fees may be charged even if the transfer fails. Check Activity before retrying.</p></div>}
      </div>}
    </div>
    <div className="shrink-0 pt-3 border-t border-[#222226]">
      <div id="approval-status" aria-live="polite" className="text-xs mb-3 space-y-2 max-h-28 overflow-y-auto">
        {error && <p role="alert" className="text-red-300 break-words">{error}</p>}
        {unavailable && <p role="alert" className="text-orange-300">This request is missing review details. Reject it, reload the extension, and request approval again.</p>}
        {expired && !error && <p className="text-orange-300">Fee review expired. Refresh fees before approving.</p>}
        {loading && <p className="flex items-center gap-2 text-zinc-400"><LoaderCircle className="w-4 h-4 animate-spin" />Calculating network and setup fees…</p>}
        {needsReview && !loading && !busy && <button type="button" className="text-[#E06341] underline cursor-pointer" onClick={() => { setQuote(null); setError(null); setLoading(true); setAttempt(value => value + 1); }}>Retry fee review</button>}
        {busy && <p className="text-zinc-400">Processing your decision. Check Activity before retrying a transfer.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={busy} onClick={() => void decide(false)} className="py-3 rounded-xl bg-[#141416] border border-[#27272A] font-semibold text-sm text-zinc-300 flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"><X className="w-4 h-4" />Reject</button>
        <button type="button" aria-describedby="approval-status" disabled={!canApprove} onClick={() => void decide(true)} className="py-3 rounded-xl bg-[#E06341] font-semibold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{busy ? "Processing…" : loading ? "Getting fees…" : intent?.kind === "transfer" ? "Approve & send" : "Approve"}</button>
      </div>
    </div>
  </div>;
}

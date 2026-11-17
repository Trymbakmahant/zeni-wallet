import React, { useState } from "react";
import { X, Send, Fuel, ShieldCheck, CheckCircle2, AlertCircle, ChevronDown, Check, ExternalLink } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";
import { type QorTransferQuote } from "@zeni/core";
import { TransactionExplorerLink } from "../components/TransactionExplorerLink";

export const SendModal: React.FC = () => {
  const { openModal, tokens, sendTokens } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("QOR");
  const [showTokenSelect, setShowTokenSelect] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [quote, setQuote] = useState<QorTransferQuote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeToken = tokens.find((t) => t.symbol === selectedToken) || tokens[0];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) return;

    if (!recipient.trim().startsWith("0x") && !recipient.trim().startsWith("qor1")) {
      setError("Recipient must be a valid 0x or qor1 address");
      return;
    }

    if (!(Number(amount) > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (selectedToken !== "QOR" && parseFloat(amount) > parseFloat(activeToken.balance)) {
      setError("Insufficient balance");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (selectedToken === "QOR" && !quote) {
        const reviewed = await new Promise<QorTransferQuote>((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "PREPARE_QOR_TRANSFER", to: recipient.trim(), amount }, (response) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!response?.success) return reject(new Error(response?.error || "Could not prepare transfer"));
            resolve(response.data);
          });
        });
        setQuote(reviewed);
        return;
      }
      const hash = await sendTokens(recipient.trim(), amount, selectedToken, quote?.id);
      setTxHash(hash);
    } catch (err: any) {
      setQuote(null);
      setError(err?.message || "Transfer failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex flex-col justify-end">
      <div className="relative bg-[#0D0D10] border-t border-[#222226] rounded-t-3xl p-5 w-full max-h-[92%] flex flex-col overflow-y-auto overflow-x-hidden animate-slide-up">
        {/* Custom Token Selection Drawer */}
        {showTokenSelect && (
          <div className="absolute inset-0 bg-[#0D0D10] z-30 flex flex-col p-5 rounded-t-3xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#222226]">
              <div>
                <h3 className="font-bold text-base text-white">Select Asset</h3>
                <span className="text-[11px] text-zinc-400">Choose token to send</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTokenSelect(false)}
                className="w-7 h-7 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center text-zinc-400 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-1.5 pr-0.5">
              {tokens.filter((token) => token.symbol === "QOR").map((token) => {
                const isSelected = selectedToken === token.symbol;

                return (
                  <button
                    key={token.symbol}
                    type="button"
                    onClick={() => {
                      setSelectedToken(token.symbol);
                      setShowTokenSelect(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#18181C] border border-[#E06341]/50 shadow-sm"
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
              <Send className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-base text-white">Send Tokens</h2>
          </div>
          <button
            onClick={() => openModal(null)}
            className="w-7 h-7 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center text-zinc-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {txHash ? (
          <div className="py-8 flex flex-col items-center text-center space-y-3.5">
            <div className="w-14 h-14 rounded-full bg-[#E06341]/20 text-[#E06341] flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Transfer confirmed!</h3>
              <p className="text-xs text-zinc-400 max-w-xs font-mono break-all mt-1">
                {txHash.slice(0, 18)}...{txHash.slice(-10)}
              </p>
            </div>
            <div className="text-[11px] text-[#E06341] bg-[#E06341]/10 px-3 py-1 rounded-full border border-[#E06341]/25 font-mono">
              {selectedToken === "QOR" ? "Transfer signed with hybrid PQC" : "Demo transfer"}
            </div>

            <div className="pt-2 w-full flex flex-col gap-2">
              <TransactionExplorerLink hash={txHash} className="w-full py-2.5 rounded-xl bg-[#18181C] border border-[#2E2E34] text-xs font-medium flex items-center justify-center gap-1.5" />

              <button
                type="button"
                onClick={() => openModal(null)}
                className="w-full py-2.5 rounded-xl bg-[#E06341] hover:bg-[#EB6841] text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4 pt-4 flex-1 flex flex-col min-w-0 max-w-full">
            {error && (
              <div className="w-full max-w-full overflow-hidden p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 break-words break-all leading-relaxed">
                  {error}
                </div>
              </div>
            )}

            {/* Asset Selector */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Asset</label>
              <button
                type="button"
                disabled={isSubmitting || !!quote}
                onClick={() => setShowTokenSelect(true)}
                className="w-full flex items-center justify-between bg-black hover:bg-[#141416] border border-[#222226] hover:border-[#2E2E34] rounded-2xl px-3.5 py-2.5 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <CryptoIcon symbol={selectedToken} className="w-7 h-7 shrink-0" />
                  <div className="text-left">
                    <div className="font-bold text-sm text-white leading-tight">{activeToken.symbol}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{activeToken.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right font-mono">
                    <div className="text-xs font-bold text-white">Bal: {activeToken.balance}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                </div>
              </button>
            </div>

            {/* Recipient */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Recipient Address</label>
              <input
                type="text"
                placeholder="0x... or qor1..."
                value={recipient}
                disabled={isSubmitting || !!quote}
                onChange={(e) => { setRecipient(e.target.value); setQuote(null); }}
                required
                className="w-full bg-black border border-[#222226] rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-[#E06341] text-white"
              />
            </div>

            {/* Amount */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-zinc-400">Amount</label>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-zinc-400">Available: {activeToken.balance}</span>
                  <button
                    type="button"
                    disabled={isSubmitting || !!quote}
                    onClick={async () => {
                      if (selectedToken !== "QOR") { setAmount(activeToken.balance); return; }
                      if (!recipient.trim()) { setError("Enter the recipient before calculating the maximum."); return; }
                      setIsSubmitting(true);
                      setError(null);
                      try {
                        const reviewed = await new Promise<QorTransferQuote>((resolve, reject) => {
                          chrome.runtime.sendMessage({ type: "PREPARE_QOR_TRANSFER", to: recipient.trim(), amount: "MAX" }, (response) => {
                            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                            if (!response?.success) return reject(new Error(response?.error || "Could not calculate maximum"));
                            resolve(response.data);
                          });
                        });
                        setAmount(reviewed.amount);
                        setQuote(reviewed);
                      } catch (err: any) {
                        setError(err.message);
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="text-[#E06341] font-semibold hover:underline"
                  >
                    MAX
                  </button>
                </div>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  placeholder="0.0"
                  value={amount}
                  disabled={isSubmitting || !!quote}
                  onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                  required
                  className="w-full bg-black border border-[#222226] rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#E06341] text-white"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-zinc-400">
                  {activeToken.symbol}
                </span>
              </div>
            </div>

            {/* Network Gas Fee */}
            <div className="p-3 rounded-xl bg-[#141418] border border-[#222226] flex items-center justify-between text-xs text-zinc-300">
              <div className="flex items-center gap-2 text-zinc-400">
                <Fuel className="w-4 h-4 text-[#E06341]" />
                <span>{quote ? "Maximum Network Fees" : "Network Gas Fee"}</span>
              </div>
              <div className="text-right font-mono">
                <span className="font-semibold text-white">{quote ? `${quote.maxNetworkFee} QOR` : selectedToken === "QOR" ? "Calculated on review" : "~0.0030 QOR"}</span>
              </div>
            </div>

            {quote && (
              <div className="p-3 rounded-xl bg-[#141418] border border-[#E06341]/40 text-xs text-zinc-300 space-y-2">
                <p className="font-semibold text-white">Authorize {quote.amount} QOR to {quote.to.slice(0, 8)}…{quote.to.slice(-6)}</p>
                <p>The transfer itself is signed with your classical and post-quantum keys. Native recipient: <span className="break-all">{quote.nativeTo}</span></p>
                {quote.registrationRequired && <p>First-time setup registers your post-quantum key using your classical key and proof of possession; the transfer is hybrid signed.</p>}
                <p>Setup fees are included above and remain charged if a later step fails. Actual fees are calculated before signing.</p>
                <button type="button" disabled={isSubmitting} onClick={() => setQuote(null)} className="text-[#E06341]">Edit transfer</button>
              </div>
            )}

            {/* Sign & Submit */}
            <div className="pt-2 mt-auto">
              <button
                type="submit"
                disabled={isSubmitting || !amount || !recipient}
                className="w-full py-3.5 rounded-xl bg-[#E06341] hover:bg-[#EB6841] text-white font-semibold text-sm shadow-xl shadow-[#E06341]/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>{quote ? "Authorizing & sending…" : "Preparing transfer…"}</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{selectedToken === "QOR" ? quote ? "Authorize & Send" : "Review Transfer" : "Confirm Send"}</span>
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

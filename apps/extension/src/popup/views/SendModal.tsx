import React, { useState } from "react";
import { X, Send, Flame, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { useWallet } from "../context/WalletContext";

export const SendModal: React.FC = () => {
  const { openModal, tokens, sendTokens } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("QOR");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeToken = tokens.find((t) => t.symbol === selectedToken) || tokens[0];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) return;

    if (!recipient.startsWith("0x") && !recipient.startsWith("qor1")) {
      setError("Recipient must be a valid 0x or qor1 address");
      return;
    }

    if (parseFloat(amount) > parseFloat(activeToken.balance)) {
      setError("Insufficient balance");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const hash = await sendTokens(recipient, amount, selectedToken);
      setTxHash(hash);
      setTimeout(() => {
        openModal(null);
      }, 2500);
    } catch (err: any) {
      setError(err?.message || "Transfer failed");
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
            <div className="w-8 h-8 rounded-full bg-[#9939FF]/20 flex items-center justify-center text-[#9939FF]">
              <Send className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-base">Send Tokens</h2>
          </div>
          <button
            onClick={() => openModal(null)}
            className="w-7 h-7 rounded-full bg-[#20283E] hover:bg-[#2A3450] flex items-center justify-center text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {txHash ? (
          <div className="py-10 flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold">Transaction Confirmed!</h3>
            <p className="text-xs text-[#8892B0] max-w-xs font-mono break-all">
              Tx: {txHash.slice(0, 16)}...{txHash.slice(-8)}
            </p>
            <div className="text-[11px] text-[#00F0FF] bg-[#00F0FF]/10 px-3 py-1 rounded-full border border-[#00F0FF]/25 font-mono">
              Hybrid Signed: secp256k1 + ML-DSA-87
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4 pt-4 flex-1 flex flex-col">
            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Asset Selector */}
            <div>
              <label className="text-xs text-[#8892B0] block mb-1">Asset</label>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#20283E] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#9939FF]"
              >
                {tokens.map((t) => (
                  <option key={t.symbol} value={t.symbol}>
                    {t.symbol} — {t.name} (Bal: {t.balance})
                  </option>
                ))}
              </select>
            </div>

            {/* Recipient */}
            <div>
              <label className="text-xs text-[#8892B0] block mb-1">Recipient Address</label>
              <input
                type="text"
                placeholder="0x... or qor1..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                required
                className="w-full bg-[#0B0E14] border border-[#20283E] rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-[#9939FF] text-white"
              />
            </div>

            {/* Amount */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-[#8892B0]">Amount</label>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[#8892B0]">Available: {activeToken.balance}</span>
                  <button
                    type="button"
                    onClick={() => setAmount(activeToken.balance)}
                    className="text-[#9939FF] font-semibold hover:underline"
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
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full bg-[#0B0E14] border border-[#20283E] rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#9939FF] text-white"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-[#8892B0]">
                  {activeToken.symbol}
                </span>
              </div>
            </div>

            {/* Gas Sponsorship Badge */}
            <div className="p-3 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/25 flex items-center justify-between text-xs text-[#00F0FF]">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-[#00F0FF]" />
                <span>Gas Sponsorship</span>
              </div>
              <span className="font-mono font-bold">0.00 QOR (Sponsored by Paymaster)</span>
            </div>

            {/* Sign & Submit */}
            <div className="pt-2 mt-auto">
              <button
                type="submit"
                disabled={isSubmitting || !amount || !recipient}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#8324E6] text-white font-semibold text-sm shadow-xl shadow-[#9939FF]/20 disabled:opacity-50 hover:opacity-95 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>Generating Hybrid Signature...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirm & Post-Quantum Sign</span>
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

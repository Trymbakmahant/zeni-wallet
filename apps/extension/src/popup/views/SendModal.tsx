import React, { useState } from "react";
import { X, Send, Flame, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";

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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex flex-col justify-end">
      <div className="bg-[#0D0D10] border-t border-[#222226] rounded-t-3xl p-5 w-full max-h-[92%] flex flex-col overflow-y-auto animate-slide-up">
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
          <div className="py-10 flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#E06341]/20 text-[#E06341] flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Transaction Confirmed!</h3>
            <p className="text-xs text-zinc-400 max-w-xs font-mono break-all">
              Tx: {txHash.slice(0, 16)}...{txHash.slice(-8)}
            </p>
            <div className="text-[11px] text-[#E06341] bg-[#E06341]/10 px-3 py-1 rounded-full border border-[#E06341]/25 font-mono">
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
              <label className="text-xs text-zinc-400 block mb-1">Asset</label>
              <div className="flex items-center bg-black border border-[#222226] rounded-xl px-3 py-2">
                <CryptoIcon symbol={selectedToken} className="w-6 h-6 shrink-0 mr-2" />
                <select
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold focus:outline-none text-white cursor-pointer"
                >
                  {tokens.map((t) => (
                    <option key={t.symbol} value={t.symbol} className="bg-[#0D0D10] text-white">
                      {t.symbol} — {t.name} (Bal: {t.balance})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Recipient */}
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Recipient Address</label>
              <input
                type="text"
                placeholder="0x... or qor1..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
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
                    onClick={() => setAmount(activeToken.balance)}
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
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full bg-black border border-[#222226] rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#E06341] text-white"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-zinc-400">
                  {activeToken.symbol}
                </span>
              </div>
            </div>

            {/* Gas Sponsorship Badge */}
            <div className="p-3 rounded-xl bg-[#E06341]/10 border border-[#E06341]/25 flex items-center justify-between text-xs text-zinc-200">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-[#E06341]" />
                <span>Gas Sponsorship</span>
              </div>
              <span className="font-mono font-bold text-[#E06341]">0.00 QOR (Sponsored by Paymaster)</span>
            </div>

            {/* Sign & Submit */}
            <div className="pt-2 mt-auto">
              <button
                type="submit"
                disabled={isSubmitting || !amount || !recipient}
                className="w-full py-3.5 rounded-xl bg-[#E06341] hover:bg-[#EB6841] text-white font-semibold text-sm shadow-xl shadow-[#E06341]/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
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

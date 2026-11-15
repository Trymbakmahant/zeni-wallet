import React, { useState } from "react";
import { Lock, ArrowRight, ShieldCheck, KeyRound } from "lucide-react";
import { useWallet } from "../context/WalletContext";

export const UnlockView: React.FC = () => {
  const { unlock } = useWallet();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setError("");

    try {
      await unlock(password);
    } catch (err: any) {
      setError("Incorrect password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] text-white p-6 justify-between">
      <div className="flex flex-col items-center pt-8">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#9939FF] to-[#00F0FF] flex items-center justify-center font-bold text-3xl shadow-2xl shadow-[#9939FF]/40 mb-4 animate-pulse">
          銭
        </div>
        <h1 className="text-xl font-bold tracking-tight">Zeni Wallet</h1>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-[#00F0FF] bg-[#00F0FF]/10 px-2.5 py-0.5 rounded-full border border-[#00F0FF]/25 font-mono">
          <ShieldCheck className="w-3.5 h-3.5" /> NIST ML-DSA-87 Active
        </div>
      </div>

      <form onSubmit={handleUnlock} className="space-y-4 my-auto">
        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400 text-center animate-shake">
            {error}
          </div>
        )}

        <div>
          <label className="text-xs text-[#8892B0] block mb-1">Enter Password</label>
          <div className="relative">
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="w-full bg-[#141824] border border-[#20283E] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#9939FF] text-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !password}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#8324E6] text-white font-semibold text-sm shadow-xl shadow-[#9939FF]/25 flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {isLoading ? (
            <span>Decrypting Keys...</span>
          ) : (
            <>
              <span>Unlock Vault</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="text-center text-xs text-[#8892B0] pb-2">
        <p>Your keys are protected by PBKDF2 & AES-256-GCM.</p>
      </div>
    </div>
  );
};

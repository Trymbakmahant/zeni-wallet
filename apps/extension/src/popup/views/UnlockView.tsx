import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { KeyRound, X } from "lucide-react";

export const UnlockView: React.FC = () => {
  const { unlock, resetWallet } = useWallet();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isLoading) return;

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

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetWallet();
    } catch (err: any) {
      setError("Failed to reset wallet.");
      setIsResetting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#000000] text-white justify-between relative overflow-hidden select-none">
      {/* Top Brand Identity - Iconic Japanese Zeni Coin (Circle with Square Center) */}
      <div className="flex flex-col items-center pt-10 pb-2 z-10 select-none">
        {/* Zeni Coin Emblem */}
        <div className="relative mb-3 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full border-[3px] border-white flex items-center justify-center shadow-[0_0_24px_rgba(255,255,255,0.18)] transition-transform hover:scale-105">
            <div className="w-4 h-4 border-[2.5px] border-white" />
          </div>
        </div>

        {/* Clean, Bold Brand Typography */}
        <div className="text-center font-black tracking-[-0.04em] text-white leading-[0.92] font-sans">
          <div className="text-[40px] tracking-tight">Zeni</div>
          <div className="text-[34px] tracking-tight text-zinc-200">Wallet</div>
        </div>
      </div>

      {/* Main Form */}
      <div className="px-6 w-full max-w-[340px] mx-auto z-10 flex flex-col items-center mb-auto pt-4">
        <form onSubmit={handleUnlock} className="w-full space-y-4">
          {error && (
            <div className="w-full max-w-full overflow-hidden p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 text-center animate-shake break-words break-all leading-relaxed">
              {error}
            </div>
          )}

          <div>
            <input
              type="password"
              placeholder="Enter Zeni password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="w-full bg-[#0D0D10] border border-[#27272A] rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !password}
            className={`w-full py-3.5 rounded-full font-semibold text-sm transition-all duration-200 flex items-center justify-center ${
              !password
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-80"
                : "bg-[#E06341] text-white hover:bg-[#EB6841] shadow-lg shadow-[#E06341]/20 cursor-pointer active:scale-[0.99]"
            }`}
          >
            {isLoading ? "Unlocking..." : "Unlock"}
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => setShowForgotModal(true)}
              className="text-zinc-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>

      {/* Bottom Zen Sumi-e Landscape Artwork (Bonsai Pine, Japanese Pagoda, Mountain Mist) */}
      <div className="w-full relative pointer-events-none select-none mt-auto overflow-hidden">
        <img
          src="/art/zen-landscape-blended.png"
          alt="Zen Japanese Landscape"
          className="w-full h-32 object-cover object-bottom translate-y-2 block opacity-90"
        />
        {/* Subtle top fade to dissolve smoothly into pure black */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-[#000000]" />
      </div>

      {/* Forgot Password Reset Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-5 animate-fade-in">
          <div className="bg-[#0D0D10] border border-[#222226] rounded-2xl p-5 w-full max-w-[310px] space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
                <h3 className="font-bold text-sm text-white">Reset Wallet?</h3>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="w-6 h-6 rounded-full hover:bg-[#18181C] flex items-center justify-center text-zinc-400 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Zeni cannot recover your password. To set a new password, you must reset your wallet and restore your account using your 12-word Secret Recovery Phrase.
            </p>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer shadow-lg shadow-red-600/20"
              >
                {isResetting ? "Resetting..." : "Reset Wallet & Start Fresh"}
              </button>
              <button
                onClick={() => setShowForgotModal(false)}
                className="w-full py-2.5 rounded-xl bg-[#18181C] hover:bg-[#222226] border border-[#27272A] text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

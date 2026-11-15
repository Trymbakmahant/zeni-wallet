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
      {/* Top Brand Logo - Styled with bold stacked typography like MetaMask */}
      <div className="flex flex-col items-center pt-16 pb-4 z-10">
        <div className="text-center font-black tracking-[-0.04em] text-white leading-[0.92] font-sans">
          <div className="text-[52px]">Zeni</div>
          <div className="text-[46px] tracking-[-0.03em] -mt-1 text-white">Wallet</div>
        </div>
      </div>

      {/* Main Form */}
      <div className="px-6 w-full max-w-[340px] mx-auto z-10 flex flex-col items-center mb-auto pt-6">
        <form onSubmit={handleUnlock} className="w-full space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400 text-center animate-shake">
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
              className="w-full bg-transparent border border-[#27272A] rounded-xl px-4 py-3.5 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#52525B] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !password}
            className={`w-full py-3.5 rounded-full font-semibold text-sm transition-all duration-200 flex items-center justify-center ${
              !password
                ? "bg-[#6B7280] text-[#111827] cursor-not-allowed opacity-85"
                : "bg-gradient-to-r from-[#9939FF] to-[#00F0FF] text-white hover:opacity-95 shadow-lg shadow-[#00F0FF]/25 cursor-pointer active:scale-[0.99]"
            }`}
          >
            {isLoading ? "Unlocking..." : "Unlock"}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setShowForgotModal(true)}
              className="text-[#5B8DEF] hover:text-[#00F0FF] text-xs font-medium transition-colors cursor-pointer"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>

      {/* Bottom Origami Geometric Artwork - Inspired by MetaMask's bottom polygonal planes */}
      <div className="w-full relative pointer-events-none select-none mt-auto">
        <svg
          viewBox="0 0 360 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto block"
          preserveAspectRatio="none"
        >
          {/* Left Ear/Cheek Geometry */}
          <polygon points="0,140 32,20 105,140" fill="#2E0854" />
          <polygon points="32,20 105,140 145,95" fill="#9939FF" />
          <polygon points="105,140 145,95 145,140" fill="#6814B3" />

          {/* Center Bridge/Snout Trapezoid in Zeni Electric Cyan */}
          <polygon points="145,95 180,95 180,140 145,140" fill="#00E5FF" />
          <polygon points="180,95 215,95 215,140 180,140" fill="#00C4D6" />

          {/* Right Ear/Cheek Geometry */}
          <polygon points="215,95 215,140 255,140" fill="#6814B3" />
          <polygon points="215,95 255,140 328,20" fill="#9939FF" />
          <polygon points="255,140 328,20 360,140" fill="#2E0854" />
        </svg>
      </div>

      {/* Forgot Password Reset Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-5 animate-fade-in">
          <div className="bg-[#141824] border border-[#20283E] rounded-2xl p-5 w-full max-w-[310px] space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
                <h3 className="font-bold text-sm text-white">Reset Wallet?</h3>
              </div>
              <button
                onClick={() => setShowForgotModal(false)}
                className="w-6 h-6 rounded-full hover:bg-[#20283E] flex items-center justify-center text-gray-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-[#8892B0] leading-relaxed">
              Zeni cannot recover your password. To set a new password, you must reset your wallet and restore your account using your 12-word Secret Recovery Phrase.
            </p>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="w-full py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-semibold transition-colors flex items-center justify-center"
              >
                {isResetting ? "Resetting..." : "Reset & Restore with Phrase"}
              </button>
              <button
                onClick={() => setShowForgotModal(false)}
                className="w-full py-2.5 rounded-xl bg-[#20283E] hover:bg-[#2A3550] text-gray-300 text-xs font-medium transition-colors"
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

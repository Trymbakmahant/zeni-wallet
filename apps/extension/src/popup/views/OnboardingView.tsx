import React, { useState } from "react";
import { ArrowLeft, Copy, Check, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { generateNewMnemonic } from "@zeni/core";

export const OnboardingView: React.FC = () => {
  const { createWallet } = useWallet();
  const [step, setStep] = useState<"welcome" | "create_backup" | "import_words" | "set_password">("welcome");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [importText, setImportText] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [backedUpChecked, setBackedUpChecked] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const startCreate = () => {
    const generated = generateNewMnemonic(128);
    setMnemonic(generated);
    setStep("create_backup");
  };

  const startImport = () => {
    setStep("import_words");
  };

  const copyWords = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinish = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const phraseToUse = step === "set_password" && importText ? importText : mnemonic;
      await createWallet(password, phraseToUse);
    } catch (err: any) {
      setError(err?.message || "Failed to initialize wallet");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#000000] text-white justify-between relative overflow-hidden select-none">
      {/* Step: Welcome Screen */}
      {step === "welcome" && (
        <div className="flex flex-col h-full justify-between relative overflow-hidden select-none">
          {/* Top Brand Identity */}
          <div className="flex flex-col items-center pt-10 pb-2 z-10">
            {/* Zeni Coin Emblem */}
            <div className="relative mb-3 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border-[3px] border-white flex items-center justify-center shadow-[0_0_24px_rgba(255,255,255,0.18)] transition-transform hover:scale-105">
                <div className="w-4 h-4 border-[2.5px] border-white" />
              </div>
            </div>

            {/* Clean Bold Brand Typography */}
            <div className="text-center font-black tracking-[-0.04em] text-white leading-[0.92] font-sans">
              <div className="text-[38px] tracking-tight">Zeni</div>
              <div className="text-[32px] tracking-tight text-zinc-200">Wallet</div>
            </div>

            <p className="text-xs text-zinc-400 text-center max-w-[260px] mt-3 leading-relaxed">
              The Zen of Web3. Next-generation post-quantum security on QoreChain.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="px-6 w-full max-w-[340px] mx-auto z-10 space-y-3 mb-2">
            <button
              onClick={startCreate}
              className="w-full py-3.5 rounded-full bg-[#E06341] hover:bg-[#EB6841] text-white font-bold text-sm shadow-lg shadow-[#E06341]/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Create a new wallet</span>
            </button>

            <button
              onClick={startImport}
              className="w-full py-3.5 rounded-full bg-[#121215] hover:bg-[#1A1A1E] border border-[#27272A] text-white font-semibold text-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>I already have a wallet</span>
            </button>

            <p className="text-[10px] text-zinc-500 text-center pt-1">
              Learn how Zeni handles your data in our <a href="https://zeni-wallet.vercel.app/privacy.html" target="_blank" rel="noreferrer" className="text-zinc-300 underline underline-offset-2">Privacy policy</a>.
            </p>
          </div>

          {/* Bottom Zen Sumi-e Landscape Art */}
          <div className="w-full relative pointer-events-none select-none mt-auto overflow-hidden">
            <img
              src="/art/zen-landscape-blended.png"
              alt="Zen Japanese Landscape"
              className="w-full h-32 object-cover object-bottom block"
              style={{
                maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.7) 45%, black 75%)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.7) 45%, black 75%)",
              }}
            />
            {/* Seamless multi-stop scrim overlay dissolving to pure black */}
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-black/25 via-45% to-black" />
            <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black via-black/80 to-transparent" />
          </div>
        </div>
      )}

      {/* Step: Create Backup Mnemonic */}
      {step === "create_backup" && (
        <div className="flex flex-col h-full justify-between p-5 z-10">
          <div>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setStep("welcome")}
                className="w-8 h-8 rounded-full bg-[#141416] hover:bg-[#1F1F24] border border-[#27272A] flex items-center justify-center text-zinc-300 transition-colors cursor-pointer"
                title="Go back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-zinc-400">Step 1 of 2</span>
              <div className="w-8" />
            </div>

            <h2 className="text-xl font-bold tracking-tight mb-1 text-white">Secret Recovery Phrase</h2>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Write down these 12 words in order and store them offline safely. Do not share them with anyone.
            </p>

            <div className="grid grid-cols-3 gap-2 bg-[#0D0D10] p-3.5 rounded-2xl border border-[#222226]">
              {mnemonic.split(" ").map((word, idx) => (
                <div
                  key={idx}
                  className="bg-black px-2 py-2 rounded-xl border border-[#222226] text-xs font-mono flex items-center gap-1.5"
                >
                  <span className="text-[10px] text-zinc-500 w-3">{idx + 1}.</span>
                  <span className="font-semibold text-white truncate">{word}</span>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <button
                onClick={copyWords}
                className="w-full py-2.5 bg-[#141416] hover:bg-[#1F1F24] text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 text-zinc-300 border border-[#27272A] transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                <span>{copied ? "Copied to Clipboard" : "Copy to clipboard"}</span>
              </button>
            </div>

            <label className="flex items-start gap-2.5 pt-4 cursor-pointer text-xs text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={backedUpChecked}
                onChange={(e) => setBackedUpChecked(e.target.checked)}
                className="mt-0.5 rounded accent-[#E06341] w-4 h-4"
              />
              <span className="leading-tight text-xs text-zinc-400">
                I have saved these 12 secret words in a safe place.
              </span>
            </label>
          </div>

          <button
            disabled={!backedUpChecked}
            onClick={() => setStep("set_password")}
            className="w-full py-3.5 rounded-full bg-[#E06341] hover:bg-[#EB6841] text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#E06341]/20 transition-all active:scale-[0.99] cursor-pointer"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step: Import Words */}
      {step === "import_words" && (
        <div className="flex flex-col h-full justify-between p-5 z-10">
          <div>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setStep("welcome")}
                className="w-8 h-8 rounded-full bg-[#141416] hover:bg-[#1F1F24] border border-[#27272A] flex items-center justify-center text-zinc-300 transition-colors cursor-pointer"
                title="Go back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-zinc-400">Import Wallet</span>
              <div className="w-8" />
            </div>

            <h2 className="text-xl font-bold tracking-tight mb-1 text-white">Import Secret Phrase</h2>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Enter your 12- or 24-word Secret Recovery Phrase separated by single spaces.
            </p>

            <textarea
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="e.g. quantum horizon energy matrix pulse velvet nebula crystal flame shadow drift solar"
              className="w-full bg-[#0D0D10] border border-[#27272A] rounded-2xl p-4 text-xs font-mono focus:outline-none focus:border-white text-white resize-none placeholder-zinc-500"
            />
          </div>

          <button
            disabled={importText.trim().split(/\s+/).length < 12}
            onClick={() => setStep("set_password")}
            className="w-full py-3.5 rounded-full bg-[#E06341] hover:bg-[#EB6841] text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#E06341]/20 transition-all active:scale-[0.99] cursor-pointer"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step: Set Password */}
      {step === "set_password" && (
        <div className="flex flex-col h-full justify-between p-5 z-10">
          <form onSubmit={handleFinish} className="flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => setStep(importText ? "import_words" : "create_backup")}
                  className="w-8 h-8 rounded-full bg-[#141416] hover:bg-[#1F1F24] border border-[#27272A] flex items-center justify-center text-zinc-300 transition-colors cursor-pointer"
                  title="Go back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono text-zinc-400">
                  {importText ? "Step 2 of 2" : "Step 2 of 2"}
                </span>
                <div className="w-8" />
              </div>

              <h2 className="text-xl font-bold tracking-tight mb-1 text-white">Set Unlock Password</h2>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                This password will unlock your Zeni wallet only on this device.
              </p>

              {error && (
                <div className="w-full max-w-full overflow-hidden p-3 mb-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 text-center animate-shake break-words break-all leading-relaxed">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">New Password (min 12 chars)</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter new password"
                      className="w-full bg-[#0D0D10] border border-[#27272A] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white text-white placeholder-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Confirm Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Confirm your password"
                    className="w-full bg-[#0D0D10] border border-[#27272A] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white text-white placeholder-zinc-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || password.length < 12 || password !== confirmPassword}
              className="w-full py-3.5 rounded-full bg-[#E06341] hover:bg-[#EB6841] text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#E06341]/20 transition-all active:scale-[0.99] cursor-pointer mt-4"
            >
              {isLoading ? "Encrypting Vault..." : "Complete Setup"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

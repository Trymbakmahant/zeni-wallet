import React, { useState } from "react";
import { ShieldCheck, KeyRound, ArrowRight, Copy, Check, Eye, EyeOff, AlertTriangle } from "lucide-react";
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

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
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
    <div className="flex flex-col h-full bg-[#0B0E14] text-white p-5 justify-between">
      {/* Top Branding */}
      <div>
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#9939FF] to-[#00F0FF] flex items-center justify-center font-bold text-lg shadow-lg shadow-[#9939FF]/30">
            銭
          </div>
          <div>
            <div className="font-extrabold text-base tracking-tight">Zeni Wallet</div>
            <div className="text-[10px] text-[#00F0FF] font-mono flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#00F0FF]" /> Post-Quantum Defense
            </div>
          </div>
        </div>

        {/* Welcome Screen */}
        {step === "welcome" && (
          <div className="space-y-6 pt-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome to Zeni</h1>
              <p className="text-xs text-[#8892B0] leading-relaxed">
                The quantum-resistant smart account wallet for QoreChain. Dual-key security (secp256k1 + ML-DSA-87) with gasless onboarding.
              </p>
            </div>

            <div className="space-y-3 pt-4">
              <button
                onClick={startCreate}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#8324E6] text-white font-semibold text-sm shadow-xl shadow-[#9939FF]/20 flex items-center justify-between hover:scale-[1.01] transition-transform"
              >
                <span>Create New Wallet</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={startImport}
                className="w-full py-3.5 px-4 rounded-xl bg-[#141824] hover:bg-[#1A2033] border border-[#20283E] text-white font-semibold text-sm flex items-center justify-between transition-colors"
              >
                <span>Import Existing Phrase</span>
                <KeyRound className="w-4 h-4 text-[#8892B0]" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Create Backup Mnemonic */}
        {step === "create_backup" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold mb-1">Backup Recovery Phrase</h2>
              <p className="text-[11px] text-[#8892B0]">
                Write down these 12 secret words in order and store them offline. Anyone with these words can access your assets.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-[#141824] p-3 rounded-2xl border border-[#20283E]">
              {mnemonic.split(" ").map((word, idx) => (
                <div key={idx} className="bg-[#0B0E14] px-2 py-1.5 rounded-lg border border-[#20283E] text-xs font-mono flex items-center gap-1.5">
                  <span className="text-[10px] text-[#8892B0] w-3">{idx + 1}.</span>
                  <span className="font-semibold text-white">{word}</span>
                </div>
              ))}
            </div>

            <button
              onClick={copyWords}
              className="w-full py-2 bg-[#20283E] hover:bg-[#2A3450] text-xs font-mono rounded-lg flex items-center justify-center gap-1.5 text-gray-300 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied to Clipboard" : "Copy Words"}</span>
            </button>

            <label className="flex items-start gap-2 pt-2 cursor-pointer text-xs text-gray-300">
              <input
                type="checkbox"
                checked={backedUpChecked}
                onChange={(e) => setBackedUpChecked(e.target.checked)}
                className="mt-0.5 rounded accent-[#9939FF]"
              />
              <span>I have safely backed up these 12 words in a secure place.</span>
            </label>
          </div>
        )}

        {/* Step: Import Words */}
        {step === "import_words" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold mb-1">Import Secret Phrase</h2>
              <p className="text-[11px] text-[#8892B0]">
                Enter your 12- or 24-word recovery phrase separated by single spaces.
              </p>
            </div>

            <textarea
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="e.g. quantum horizon energy matrix pulse velvet nebula crystal flame shadow drift solar"
              className="w-full bg-[#141824] border border-[#20283E] rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-[#9939FF] text-white resize-none"
            />
          </div>
        )}

        {/* Step: Set Password */}
        {step === "set_password" && (
          <form onSubmit={handleFinish} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold mb-1">Set Unlock Password</h2>
              <p className="text-[11px] text-[#8892B0]">
                This password will unlock your Zeni wallet only on this device.
              </p>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-400">
                {error}
              </div>
            )}

            <div>
              <label className="text-xs text-[#8892B0] block mb-1">New Password (min 8 chars)</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-[#141824] border border-[#20283E] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#9939FF]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[#8892B0]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-[#8892B0] block mb-1">Confirm Password</label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-[#141824] border border-[#20283E] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#9939FF]"
              />
            </div>
          </form>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="pt-4 border-t border-[#20283E]/60">
        {step === "create_backup" && (
          <button
            disabled={!backedUpChecked}
            onClick={() => setStep("set_password")}
            className="w-full py-3 rounded-xl bg-[#9939FF] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#8324E6] text-white font-semibold text-sm transition-all"
          >
            Continue
          </button>
        )}

        {step === "import_words" && (
          <div className="flex gap-2">
            <button
              onClick={() => setStep("welcome")}
              className="py-3 px-4 rounded-xl bg-[#141824] text-xs font-semibold text-[#8892B0]"
            >
              Back
            </button>
            <button
              disabled={importText.trim().split(/\s+/).length < 12}
              onClick={() => setStep("set_password")}
              className="flex-1 py-3 rounded-xl bg-[#9939FF] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#8324E6] text-white font-semibold text-sm transition-all"
            >
              Continue
            </button>
          </div>
        )}

        {step === "set_password" && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(importText ? "import_words" : "create_backup")}
              className="py-3 px-4 rounded-xl bg-[#141824] text-xs font-semibold text-[#8892B0]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleFinish}
              disabled={isLoading || password.length < 8}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#00F0FF] text-white font-semibold text-sm shadow-lg shadow-[#00F0FF]/15 disabled:opacity-50"
            >
              {isLoading ? "Encrypting Vault..." : "Complete Setup"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

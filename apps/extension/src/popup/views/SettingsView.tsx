import React, { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Lock, ExternalLink, Copy, Check, Trash2, AlertTriangle, X, Layers } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { QORECHAIN_CONFIG, evmToBech32Address, readPqcKeyStatus, type PqcKeyStatus } from "@zeni/core";

export const SettingsView: React.FC = () => {
  const { lock, pqcPublicKeyHash, activeAddress, exportMnemonic, resetWallet } = useWallet();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [revealedMnemonic, setRevealedMnemonic] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusRequest, setStatusRequest] = useState(0);
  const [pqcStatus, setPqcStatus] = useState<{ address: string; keyHash: string | null; request: number; value?: PqcKeyStatus; error?: string } | null>(null);
  // Never display a result for a different account, key, or refresh request.
  const currentStatus = pqcStatus?.address === activeAddress && pqcStatus?.keyHash === pqcPublicKeyHash
    && pqcStatus?.request === statusRequest ? pqcStatus : null;
  useEffect(() => {
    if (!activeAddress) return;
    const controller = new AbortController();
    readPqcKeyStatus(activeAddress, pqcPublicKeyHash, { signal: controller.signal }).then(
      value => { if (!controller.signal.aborted) setPqcStatus({ address: activeAddress, keyHash: pqcPublicKeyHash, request: statusRequest, value }); },
      () => { if (!controller.signal.aborted) setPqcStatus({ address: activeAddress, keyHash: pqcPublicKeyHash, request: statusRequest, error: "Could not verify registration. Check your connection and retry." }); },
    );
    return () => controller.abort();
  }, [activeAddress, pqcPublicKeyHash, statusRequest]);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetWallet();
    } catch (err: any) {
      setError(err?.message || "Failed to reset wallet");
      setIsResetting(false);
    }
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const phrase = await exportMnemonic(password);
      setRevealedMnemonic(phrase);
      setPassword("");
    } catch (err: any) {
      setError(err?.message || "Incorrect password");
    }
  };

  const copyMnemonic = () => {
    if (!revealedMnemonic) return;
    navigator.clipboard.writeText(revealedMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full space-y-4 overflow-y-auto pr-1">
      <h2 className="text-base font-bold text-white">Wallet & Security Settings</h2>

      <div className="p-4 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#E06341]">
          <ShieldCheck className="w-4 h-4" />
          <span>Post-Quantum Key Registration</span>
        </div>
        <div role="status" aria-live="polite" className="text-xs text-zinc-300">
          {!activeAddress ? "Unlock your wallet to check registration."
            : currentStatus?.error ? currentStatus.error
            : !currentStatus?.value ? "Checking Diana testnet…"
            : !currentStatus.value.registered ? "No PQC key registered on chain."
            : currentStatus.value.matchesLocalKey === false ? "Registered key differs from this wallet. Transfers require the original PQC key."
            : currentStatus.value.matchesLocalKey === true ? "ML-DSA-87 registered · Matches this wallet"
            : "ML-DSA-87 registered · Local key match unavailable"}
        </div>
        {currentStatus?.value && <p className="text-[10px] text-zinc-400">
          Checked at block {BigInt(currentStatus.value.blockNumber).toString()}. Registration does not confirm proof of possession; transfers check that separately.
        </p>}
        {currentStatus?.value?.publicKeyHash && <div className="text-[10px] font-mono break-all text-zinc-400">
          On-chain key hash: {currentStatus.value.publicKeyHash}
        </div>}
        <button type="button" disabled={!activeAddress || !currentStatus}
          onClick={() => setStatusRequest(value => value + 1)}
          className="px-3 py-2 rounded-xl bg-[#18181C] border border-[#222226] text-xs text-white disabled:opacity-50">
          Refresh registration
        </button>
      </div>

      {/* Cross-VM & Dual Identity */}
      <div className="p-4 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Layers className="w-4 h-4 text-[#E06341]" />
          <span>Your Account Addresses</span>
        </div>
        <p className="text-[11px] text-zinc-400">
          Two address formats identify the same account on QoreChain:
        </p>
        <div className="space-y-1.5 text-[10px] font-mono">
          <div className="p-2 rounded-xl bg-black border border-[#222226] flex flex-col gap-0.5">
            <span className="text-zinc-500 font-sans text-[9px]">EVM Address (0x)</span>
            <span className="break-all text-zinc-300">{activeAddress || "0x..."}</span>
          </div>
          <div className="p-2 rounded-xl bg-black border border-[#222226] flex flex-col gap-0.5">
            <span className="text-zinc-500 font-sans text-[9px]">Native Bank Address (qor1)</span>
            <span className="break-all text-[#E06341]">
              {activeAddress ? evmToBech32Address(activeAddress) : "qor1..."}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2 text-[11px] text-zinc-400">
        <span className="text-xs font-semibold text-white block">Wallet Protection</span>
        <p>Native QOR transfers and AMM swaps use classical and ML-DSA-87 signatures. Website message signing uses ECDSA.</p>
        <p>This wallet does not enforce daily or per-transaction spending limits. Hybrid website sign-in and Cross-VM bridge operations are not available here.</p>
      </div>

      {/* Network Config */}
      <div className="p-4 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2">
        <span className="text-xs font-semibold text-white block">Active Network</span>
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-400">Chain</span>
          <span className="font-semibold text-white">QoreChain Diana Testnet</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-400">Chain ID</span>
          <span className="font-mono text-white">9800</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-400">RPC Endpoint</span>
          <span className="font-mono text-[#E06341] text-[10px] truncate max-w-[180px]">
            {QORECHAIN_CONFIG.rpcUrls[0]}
          </span>
        </div>
      </div>

      <a href="https://zeni-wallet.vercel.app/privacy.html" target="_blank" rel="noreferrer" className="flex items-center justify-between p-4 rounded-2xl bg-[#0D0D10] border border-[#222226] text-xs text-zinc-300 hover:text-white">
        Privacy policy <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
      </a>

      {/* Export Recovery Phrase */}
      <div className="p-4 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <KeyRound className="w-4 h-4 text-[#E06341]" />
          <span>Recovery Phrase Backup</span>
        </div>
        <p className="text-[11px] text-zinc-400">
          Export your 12-word recovery phrase for external backup.
        </p>
        <button
          onClick={() => {
            setShowExportModal(true);
            setRevealedMnemonic(null);
            setPassword("");
            setError(null);
          }}
          className="w-full py-2.5 rounded-xl bg-[#18181C] hover:bg-[#27272A] border border-[#222226] text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          Export Secret Words
        </button>
      </div>

      {/* Action Buttons: Lock & Reset */}
      <div className="pt-2 space-y-2">
        <button
          onClick={lock}
          className="w-full py-3 rounded-xl bg-[#141416] hover:bg-[#1C1C20] border border-[#27272A] text-zinc-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Lock className="w-4 h-4 text-zinc-400" /> Lock Zeni Wallet
        </button>

        <button
          onClick={() => setShowResetModal(true)}
          className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" /> Reset Wallet & Start Fresh
        </button>
      </div>

      {/* Export Phrase Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-5">
          <div className="bg-[#0D0D10] border border-[#222226] rounded-3xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-base text-white">Export Secret Recovery Phrase</h3>

            {revealedMnemonic ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5 bg-black p-3 rounded-2xl border border-[#222226]">
                  {revealedMnemonic.split(" ").map((w, idx) => (
                    <div key={idx} className="text-[11px] font-mono text-white">
                      <span className="text-zinc-400 mr-1">{idx + 1}.</span>
                      {w}
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyMnemonic}
                  className="w-full py-2 bg-[#18181C] text-xs font-mono rounded-xl flex items-center justify-center gap-1.5 text-zinc-200 border border-[#222226] cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy to Clipboard"}</span>
                </button>
                <button
                  onClick={() => { setShowExportModal(false); setRevealedMnemonic(null); setPassword(""); }}
                  className="w-full py-2.5 bg-[#E06341] hover:bg-[#EB6841] text-xs font-semibold rounded-xl text-white transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleExport} className="space-y-3">
                <p className="text-xs text-zinc-400">
                  Enter your password to decrypt and view your 12 recovery words.
                </p>
                {error && <div className="text-xs text-red-400 break-words break-all">{error}</div>}
                <input
                  type="password"
                  placeholder="Your wallet password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full bg-black border border-[#222226] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#E06341] text-white"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowExportModal(false); setRevealedMnemonic(null); setPassword(""); }}
                    className="flex-1 py-2 rounded-xl bg-[#18181C] text-xs text-zinc-400 border border-[#222226]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-[#E06341] hover:bg-[#EB6841] text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    Reveal Phrase
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-5 animate-fade-in">
          <div className="bg-[#0D0D10] border border-[#222226] rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-white">Reset Zeni Wallet?</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="w-7 h-7 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center text-zinc-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This will permanently remove your stored keys, credentials, and local data from this browser extension.
            </p>

            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-[11px] text-red-300 leading-relaxed">
              Make sure you have backed up your 12-word recovery phrase if you ever want to access this address again.
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-600/20"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isResetting ? "Resetting Wallet..." : "Yes, Reset & Create Fresh"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
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

import React, { useState } from "react";
import { ShieldCheck, KeyRound, Lock, ExternalLink, Copy, Check, Eye, EyeOff } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { QORECHAIN_CONFIG } from "@zeni/core";

export const SettingsView: React.FC = () => {
  const { lock, pqcPublicKeyHash, activeAddress, exportMnemonic } = useWallet();
  const [showExportModal, setShowExportModal] = useState(false);
  const [password, setPassword] = useState("");
  const [revealedMnemonic, setRevealedMnemonic] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const phrase = await exportMnemonic(password);
      setRevealedMnemonic(phrase);
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

      {/* Post-Quantum Contract Status */}
      <div className="p-4 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#E06341]">
          <ShieldCheck className="w-4 h-4 text-[#E06341]" />
          <span>Post-Quantum Contract Defense</span>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Sensitive operations are protected on-chain by the native QoreChain precompile:
        </p>
        <div className="p-2 rounded-xl bg-black border border-[#222226] text-[10px] font-mono break-all text-zinc-300">
          Precompile: {QORECHAIN_CONFIG.contracts.pqcPrecompile}
        </div>
        <div className="p-2 rounded-xl bg-black border border-[#222226] text-[10px] font-mono break-all text-zinc-300">
          PQC PubKey Hash: {pqcPublicKeyHash || "0x9f83e201..."}
        </div>
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

      {/* Lock Wallet Button */}
      <div className="pt-2">
        <button
          onClick={lock}
          className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Lock className="w-4 h-4" /> Lock Zeni Wallet
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
                  onClick={() => setShowExportModal(false)}
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
                {error && <div className="text-xs text-red-400">{error}</div>}
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
                    onClick={() => setShowExportModal(false)}
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
    </div>
  );
};

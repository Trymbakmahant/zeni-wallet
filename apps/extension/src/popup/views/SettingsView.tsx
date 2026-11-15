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
      <h2 className="text-base font-bold">Wallet & Security Settings</h2>

      {/* Post-Quantum Contract Status */}
      <div className="p-4 rounded-2xl bg-[#141824] border border-[#20283E] space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#00F0FF]">
          <ShieldCheck className="w-4 h-4 text-[#00F0FF]" />
          <span>Post-Quantum Contract Defense</span>
        </div>
        <p className="text-[11px] text-[#8892B0] leading-relaxed">
          Sensitive operations are protected on-chain by the native QoreChain precompile:
        </p>
        <div className="p-2 rounded-xl bg-[#0B0E14] border border-[#20283E] text-[10px] font-mono break-all text-gray-300">
          Precompile: {QORECHAIN_CONFIG.contracts.pqcPrecompile}
        </div>
        <div className="p-2 rounded-xl bg-[#0B0E14] border border-[#20283E] text-[10px] font-mono break-all text-gray-300">
          PQC PubKey Hash: {pqcPublicKeyHash || "0x9f83e201..."}
        </div>
      </div>

      {/* Network Config */}
      <div className="p-4 rounded-2xl bg-[#141824] border border-[#20283E] space-y-2">
        <span className="text-xs font-semibold text-white block">Active Network</span>
        <div className="flex justify-between items-center text-xs">
          <span className="text-[#8892B0]">Chain</span>
          <span className="font-semibold text-white">QoreChain Diana Testnet</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-[#8892B0]">Chain ID</span>
          <span className="font-mono text-white">9800</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-[#8892B0]">RPC Endpoint</span>
          <span className="font-mono text-[#00F0FF] text-[10px] truncate max-w-[180px]">
            {QORECHAIN_CONFIG.rpcUrls[0]}
          </span>
        </div>
      </div>

      {/* Export Recovery Phrase */}
      <div className="p-4 rounded-2xl bg-[#141824] border border-[#20283E] space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <KeyRound className="w-4 h-4 text-[#9939FF]" />
          <span>Recovery Phrase Backup</span>
        </div>
        <p className="text-[11px] text-[#8892B0]">
          Export your 12-word recovery phrase for external backup.
        </p>
        <button
          onClick={() => {
            setShowExportModal(true);
            setRevealedMnemonic(null);
            setPassword("");
            setError(null);
          }}
          className="w-full py-2.5 rounded-xl bg-[#20283E] hover:bg-[#2A3450] text-xs font-semibold text-white transition-colors"
        >
          Export Secret Words
        </button>
      </div>

      {/* Lock Wallet Button */}
      <div className="pt-2">
        <button
          onClick={lock}
          className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Lock className="w-4 h-4" /> Lock Zeni Wallet
        </button>
      </div>

      {/* Export Phrase Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-5">
          <div className="bg-[#141824] border border-[#20283E] rounded-3xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-base">Export Secret Recovery Phrase</h3>

            {revealedMnemonic ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5 bg-[#0B0E14] p-3 rounded-2xl border border-[#20283E]">
                  {revealedMnemonic.split(" ").map((w, idx) => (
                    <div key={idx} className="text-[11px] font-mono text-white">
                      <span className="text-[#8892B0] mr-1">{idx + 1}.</span>
                      {w}
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyMnemonic}
                  className="w-full py-2 bg-[#20283E] text-xs font-mono rounded-xl flex items-center justify-center gap-1.5 text-gray-200"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy to Clipboard"}</span>
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="w-full py-2.5 bg-[#9939FF] text-xs font-semibold rounded-xl text-white"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleExport} className="space-y-3">
                <p className="text-xs text-[#8892B0]">
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
                  className="w-full bg-[#0B0E14] border border-[#20283E] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#9939FF] text-white"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowExportModal(false)}
                    className="flex-1 py-2 rounded-xl bg-[#20283E] text-xs text-gray-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-[#9939FF] text-xs font-semibold text-white"
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

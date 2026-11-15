import React, { useState } from "react";
import {
  ShieldCheck,
  Zap,
  ArrowRight,
  Flame,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  Smartphone,
  Chrome,
  Terminal,
} from "lucide-react";

export const App: React.FC = () => {
  const [sandboxAmount, setSandboxAmount] = useState("50");
  const [sandboxToken, setSandboxToken] = useState("fUSD");
  const [sponsoredTxHash, setSponsoredTxHash] = useState<string | null>(null);

  const simulateSponsoredTx = () => {
    setSponsoredTxHash("0x8e23f" + Array.from({ length: 58 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-white flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#9939FF]/20 via-[#00F0FF]/20 to-[#9939FF]/20 border-b border-[#20283E] py-2 px-4 text-center text-xs text-[#00F0FF] flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5" />
        <span>⚡ Interactive Testnet Sandbox. Never enter your personal seed phrase on a public website. Download the official Chrome Extension or iOS app for secure self-custody.</span>
      </div>

      {/* Navigation */}
      <header className="border-b border-[#20283E] px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#9939FF] to-[#00F0FF] flex items-center justify-center text-xl font-bold shadow-lg shadow-[#9939FF]/30">
            銭
          </div>
          <div>
            <div className="font-extrabold text-lg tracking-tight">Zeni Wallet</div>
            <div className="text-[10px] text-[#8892B0] font-mono">QoreChain Testnet (9800)</div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-[#8892B0]">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#quantum" className="hover:text-white transition-colors">Quantum Vault</a>
          <a href="#sandbox" className="hover:text-white transition-colors">Interactive Demo</a>
          <a href="https://build.qorechain.io" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Hackathon</a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="#download"
            className="px-4 py-2 rounded-xl bg-[#9939FF] hover:bg-[#8324E6] text-white text-xs font-semibold shadow-lg shadow-[#9939FF]/25 transition-all"
          >
            Get Zeni
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-6 max-w-7xl mx-auto flex-1 flex flex-col lg:flex-row items-center gap-12">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#141824] border border-[#20283E] text-xs text-[#00F0FF]">
            <ShieldCheck className="w-4 h-4 text-[#00F0FF]" />
            <span>NIST ML-DSA-87 (Dilithium-5) Native Verification</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1]">
            The Quantum-Proof <br />
            <span className="bg-gradient-to-r from-[#9939FF] via-[#00F0FF] to-white bg-clip-text text-transparent">
              Smart Wallet for QoreChain
            </span>
          </h1>
          <p className="text-base sm:text-lg text-[#8892B0] max-w-xl leading-relaxed">
            Consumer-grade self-custody powered by ERC-4337 smart accounts. Built-in gas sponsorship, instant token swaps, and dual-layer quantum defense backed by on-chain precompiles.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              href="#download"
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#8324E6] text-white font-semibold text-sm shadow-xl shadow-[#9939FF]/30 flex items-center gap-2 hover:scale-[1.02] transition-transform"
            >
              <Chrome className="w-4 h-4" /> Add to Chrome
            </a>
            <a
              href="#download"
              className="px-6 py-3.5 rounded-xl bg-[#141824] hover:bg-[#20283E] border border-[#20283E] text-white font-semibold text-sm flex items-center gap-2 hover:scale-[1.02] transition-transform"
            >
              <Smartphone className="w-4 h-4" /> Native iOS App
            </a>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#20283E]/60">
            <div>
              <div className="text-2xl font-bold text-white">0 QOR</div>
              <div className="text-xs text-[#8892B0]">Gasless Onboarding</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#00F0FF]">FIPS 204</div>
              <div className="text-xs text-[#8892B0]">Lattice Cryptography</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">120Hz</div>
              <div className="text-xs text-[#8892B0]">Native Apple Swift</div>
            </div>
          </div>
        </div>

        {/* Hero Interactive Wallet Mockup */}
        <div className="flex-1 max-w-md w-full">
          <div className="rounded-3xl bg-[#141824] border border-[#20283E] p-6 shadow-2xl shadow-[#9939FF]/10 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-[#20283E]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#9939FF] flex items-center justify-center font-bold text-xs">銭</div>
                <span className="font-semibold text-sm">Zeni Quantum Account</span>
              </div>
              <span className="text-[10px] bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 px-2 py-0.5 rounded-full font-mono">
                0x...a01 verified
              </span>
            </div>

            <div className="py-6">
              <span className="text-xs text-[#8892B0] uppercase font-semibold">Smart Account Balance</span>
              <div className="text-4xl font-extrabold tracking-tight mt-1">$9,640.00</div>
              <div className="flex items-center gap-2 text-xs text-[#00F0FF] mt-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Double-Signed: secp256k1 + ML-DSA-87</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 rounded-xl bg-[#0B0E14] border border-[#20283E]">
                <div className="text-xs text-[#8892B0]">Gas Sponsorship</div>
                <div className="text-sm font-semibold text-emerald-400 flex items-center gap-1 mt-0.5">
                  <Flame className="w-3.5 h-3.5" /> Active (Free)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B0E14] border border-[#20283E]">
                <div className="text-xs text-[#8892B0]">Precompile Lane</div>
                <div className="text-sm font-semibold text-white mt-0.5">EVM 9800</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0B0E14] border border-[#20283E]">
                <div className="flex items-center gap-2.5">
                  <span>💎</span>
                  <div>
                    <div className="text-sm font-semibold">QOR</div>
                    <div className="text-[10px] text-[#8892B0]">QoreChain</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">142.50</div>
                  <div className="text-[10px] text-[#8892B0]">$285.00</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0B0E14] border border-[#20283E]">
                <div className="flex items-center gap-2.5">
                  <span>💵</span>
                  <div>
                    <div className="text-sm font-semibold">fUSD</div>
                    <div className="text-[10px] text-[#8892B0]">Faucet Dollar</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">520.00</div>
                  <div className="text-[10px] text-[#8892B0]">$520.00</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Sandbox Section */}
      <section id="sandbox" className="py-16 px-6 bg-[#141824]/40 border-t border-[#20283E]">
        <div className="max-w-4xl mx-auto text-center space-y-4 mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Interactive Gasless Sandbox</h2>
          <p className="text-sm text-[#8892B0] max-w-xl mx-auto">
            Test Zeni’s sponsored UserOperation flow in your browser. Dispatches an ERC-4337 operation subsidized by the ZeniPaymaster contract.
          </p>
        </div>

        <div className="max-w-xl mx-auto rounded-2xl bg-[#141824] border border-[#20283E] p-6 shadow-xl">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#8892B0] block mb-1">Transfer Asset</label>
              <select
                value={sandboxToken}
                onChange={(e) => setSandboxToken(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#20283E] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#9939FF]"
              >
                <option value="fUSD">fUSD (Testnet Faucet Dollar)</option>
                <option value="QOR">QOR (Native QoreChain)</option>
                <option value="fETH">fETH (Testnet Ether)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#8892B0] block mb-1">Amount</label>
              <input
                type="number"
                value={sandboxAmount}
                onChange={(e) => setSandboxAmount(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#20283E] rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#9939FF]"
              />
            </div>

            <div className="p-3 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-xs text-[#00F0FF] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Flame className="w-4 h-4" /> Sponsor Fee:
              </span>
              <strong className="font-mono">0.00 QOR (Sponsored by Paymaster)</strong>
            </div>

            <button
              onClick={simulateSponsoredTx}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#00F0FF] text-white font-semibold text-sm shadow-lg shadow-[#00F0FF]/10 hover:opacity-90 transition-opacity"
            >
              Simulate Gasless UserOperation
            </button>

            {sponsoredTxHash && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> UserOp Validated & Mined!
                </div>
                <div className="font-mono text-[10px] break-all text-gray-300">Tx: {sponsoredTxHash}</div>
                <div className="text-[10px] text-[#8892B0]">Verified via Precompile 0x0000000000000000000000000000000000000a01</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#20283E] py-8 px-6 text-center text-xs text-[#8892B0]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">Zeni (銭)</span>
            <span>— The Quantum-Proof Smart Wallet</span>
          </div>
          <div>Built for QoreChain Developer Fest 2026 • MIT Licensed</div>
        </div>
      </footer>
    </div>
  );
};

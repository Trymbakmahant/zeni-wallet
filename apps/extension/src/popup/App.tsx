import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Send,
  ArrowUpDown,
  Wallet,
  Settings,
  Copy,
  Check,
  ExternalLink,
  Flame,
  KeyRound,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { QORECHAIN_CONFIG, deriveAccountKeys } from "@zeni/core";

interface TokenBalance {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  icon: string;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"home" | "send" | "swap" | "settings">("home");
  const [address, setAddress] = useState<string>("");
  const [pqcHash, setPqcHash] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Send state
  const [recipient, setRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("QOR");
  const [txSuccess, setTxSuccess] = useState(false);

  // Swap state
  const [swapFrom, setSwapFrom] = useState("QOR");
  const [swapTo, setSwapTo] = useState("fUSD");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapSuccess, setSwapSuccess] = useState(false);

  // Portfolio balances
  const [tokens, setTokens] = useState<TokenBalance[]>([
    { symbol: "QOR", name: "QoreChain Native", balance: "142.50", usdValue: "$285.00", icon: "💎" },
    { symbol: "fUSD", name: "Faucet USD", balance: "520.00", usdValue: "$520.00", icon: "💵" },
    { symbol: "fETH", name: "Faucet Ethereum", balance: "1.25", usdValue: "$3,875.00", icon: "Ξ" },
    { symbol: "fBTC", name: "Faucet Bitcoin", balance: "0.084", usdValue: "$5,460.00", icon: "₿" },
  ]);

  useEffect(() => {
    // Initialize or load wallet address from storage
    chrome.storage?.local?.get(["activeAddress", "pqcHash"], (result) => {
      if (result.activeAddress) {
        setAddress(result.activeAddress);
        setPqcHash(result.pqcHash || "");
        setIsLoading(false);
      } else {
        // Generate initial deterministic demo account
        const dummySeed = "quantum horizon energy matrix pulse velvet nebula crystal flame shadow drift solar";
        const keys = deriveAccountKeys(dummySeed);
        setAddress(keys.classicalAddress);
        setPqcHash(keys.pqcSeedHex.slice(0, 10) + "..." + keys.pqcSeedHex.slice(-6));
        chrome.storage?.local?.set({
          activeAddress: keys.classicalAddress,
          pqcHash: keys.pqcSeedHex,
        });
        setIsLoading(false);
      }
    });
  }, []);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setTxSuccess(true);
    setTimeout(() => {
      setTxSuccess(false);
      setRecipient("");
      setSendAmount("");
      setActiveTab("home");
    }, 2000);
  };

  const handleSwap = (e: React.FormEvent) => {
    e.preventDefault();
    setSwapSuccess(true);
    setTimeout(() => {
      setSwapSuccess(false);
      setSwapAmount("");
      setActiveTab("home");
    }, 2000);
  };

  const totalUsd = tokens
    .reduce((acc, t) => acc + parseFloat(t.usdValue.replace("$", "").replace(",", "")), 0)
    .toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] text-white">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#20283E] bg-[#141824]/50 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#9939FF] to-[#00F0FF] flex items-center justify-center font-bold shadow-lg shadow-[#9939FF]/20">
            銭
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm">Zeni</span>
              <span className="text-[10px] bg-[#9939FF]/20 text-[#00F0FF] border border-[#00F0FF]/30 px-1.5 py-0.2 rounded-full font-mono flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5 text-[#00F0FF]" /> PQC Active
              </span>
            </div>
            <span className="text-[10px] text-[#8892B0] font-mono">Chain ID 9800</span>
          </div>
        </div>

        {/* Address Pill */}
        <button
          onClick={copyAddress}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#20283E] hover:bg-[#2A3450] text-xs font-mono transition-colors text-gray-300"
          title="Click to copy address"
        >
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Loading..."}
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "home" && (
          <div className="flex flex-col gap-4">
            {/* Portfolio Total Balance Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#1C2237] to-[#141824] p-5 border border-[#20283E] shadow-xl">
              <div className="absolute top-0 right-0 p-3 opacity-20">
                <ShieldCheck className="w-24 h-24 text-[#00F0FF]" />
              </div>
              <span className="text-xs uppercase tracking-wider text-[#8892B0] font-semibold">Total Portfolio</span>
              <div className="text-3xl font-extrabold tracking-tight mt-1 text-white">{totalUsd}</div>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-[#00F0FF]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Protected by ML-DSA-87 Quantum Vault</span>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setActiveTab("send")}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#141824] hover:bg-[#20283E] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium"
              >
                <div className="w-10 h-10 rounded-full bg-[#9939FF]/20 flex items-center justify-center mb-1.5 text-[#9939FF]">
                  <Send className="w-5 h-5" />
                </div>
                <span>Send</span>
              </button>
              <button
                onClick={() => setActiveTab("swap")}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#141824] hover:bg-[#20283E] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium"
              >
                <div className="w-10 h-10 rounded-full bg-[#00F0FF]/20 flex items-center justify-center mb-1.5 text-[#00F0FF]">
                  <ArrowUpDown className="w-5 h-5" />
                </div>
                <span>Swap</span>
              </button>
              <button
                onClick={copyAddress}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#141824] hover:bg-[#20283E] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-1.5 text-emerald-400">
                  <Flame className="w-5 h-5" />
                </div>
                <span>Gasless</span>
              </button>
            </div>

            {/* Token List */}
            <div>
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-xs font-semibold text-[#8892B0] uppercase tracking-wider">Assets</span>
                <span className="text-[11px] text-[#9939FF] hover:underline cursor-pointer">Manage</span>
              </div>
              <div className="flex flex-col gap-2">
                {tokens.map((token) => (
                  <div
                    key={token.symbol}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#141824] hover:bg-[#1A2033] border border-[#20283E] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{token.icon}</span>
                      <div>
                        <div className="font-semibold text-sm leading-tight">{token.symbol}</div>
                        <div className="text-[11px] text-[#8892B0]">{token.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm leading-tight">{token.balance}</div>
                      <div className="text-[11px] text-[#8892B0]">{token.usdValue}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Send View */}
        {activeTab === "send" && (
          <div className="flex flex-col h-full">
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Send className="w-4 h-4 text-[#9939FF]" /> Send Tokens
            </h2>
            <form onSubmit={handleSend} className="flex flex-col gap-3 flex-1">
              <div>
                <label className="text-xs text-[#8892B0] block mb-1">Asset</label>
                <select
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  className="w-full bg-[#141824] border border-[#20283E] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#9939FF]"
                >
                  {tokens.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol} ({t.name}) — Bal: {t.balance}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-[#8892B0] block mb-1">Recipient Address</label>
                <input
                  type="text"
                  placeholder="0x... or qor1..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  required
                  className="w-full bg-[#141824] border border-[#20283E] rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#9939FF]"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-[#8892B0]">Amount</label>
                  <button
                    type="button"
                    onClick={() => setSendAmount("10")}
                    className="text-[11px] text-[#9939FF] font-medium"
                  >
                    Max
                  </button>
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  required
                  className="w-full bg-[#141824] border border-[#20283E] rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#9939FF]"
                />
              </div>

              {/* Paymaster Sponsorship Banner */}
              <div className="rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/20 p-2.5 flex items-center gap-2 text-xs text-[#00F0FF]">
                <Flame className="w-4 h-4 shrink-0 text-[#00F0FF]" />
                <span>Gas sponsored via <strong>ZeniPaymaster</strong> (0.00 QOR)</span>
              </div>

              {txSuccess ? (
                <div className="mt-auto py-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-center text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" /> Transaction Broadcasted!
                </div>
              ) : (
                <button
                  type="submit"
                  className="mt-auto w-full py-3 rounded-xl bg-[#9939FF] hover:bg-[#8324E6] font-semibold text-sm shadow-lg shadow-[#9939FF]/20 transition-all"
                >
                  Confirm & Hybrid Sign
                </button>
              )}
            </form>
          </div>
        )}

        {/* Swap View */}
        {activeTab === "swap" && (
          <div className="flex flex-col h-full">
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-[#00F0FF]" /> In-Wallet Swap
            </h2>
            <form onSubmit={handleSwap} className="flex flex-col gap-3 flex-1">
              {/* Pay In */}
              <div className="p-3 rounded-xl bg-[#141824] border border-[#20283E]">
                <span className="text-xs text-[#8892B0] block mb-1">You Pay</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    placeholder="0.0"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="w-full bg-transparent text-xl font-bold font-mono focus:outline-none"
                    required
                  />
                  <select
                    value={swapFrom}
                    onChange={(e) => setSwapFrom(e.target.value)}
                    className="bg-[#20283E] rounded-lg px-2.5 py-1 text-sm font-semibold focus:outline-none"
                  >
                    <option value="QOR">QOR</option>
                    <option value="fUSD">fUSD</option>
                    <option value="fETH">fETH</option>
                  </select>
                </div>
              </div>

              {/* Swap Switch Arrow */}
              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={() => {
                    const temp = swapFrom;
                    setSwapFrom(swapTo);
                    setSwapTo(temp);
                  }}
                  className="w-8 h-8 rounded-full bg-[#20283E] hover:bg-[#2A3450] flex items-center justify-center border border-[#303C5C] text-[#00F0FF] transition-transform hover:rotate-180"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>

              {/* Receive */}
              <div className="p-3 rounded-xl bg-[#141824] border border-[#20283E]">
                <span className="text-xs text-[#8892B0] block mb-1">You Receive (Estimated)</span>
                <div className="flex items-center gap-2">
                  <div className="w-full text-xl font-bold font-mono text-[#00F0FF]">
                    {swapAmount ? (parseFloat(swapAmount) * (swapFrom === "QOR" ? 2.0 : 0.5)).toFixed(2) : "0.00"}
                  </div>
                  <select
                    value={swapTo}
                    onChange={(e) => setSwapTo(e.target.value)}
                    className="bg-[#20283E] rounded-lg px-2.5 py-1 text-sm font-semibold focus:outline-none"
                  >
                    <option value="fUSD">fUSD</option>
                    <option value="QOR">QOR</option>
                    <option value="fETH">fETH</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between text-[11px] text-[#8892B0] px-1">
                <span>Rate</span>
                <span>1 QOR ≈ 2.00 fUSD (Uniswap v2 Pool)</span>
              </div>

              {swapSuccess ? (
                <div className="mt-auto py-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-center text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" /> Swap Confirmed On-Chain!
                </div>
              ) : (
                <button
                  type="submit"
                  className="mt-auto w-full py-3 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#00F0FF] text-white font-semibold text-sm shadow-lg shadow-[#00F0FF]/10 transition-all hover:opacity-95"
                >
                  Execute Gasless Swap
                </button>
              )}
            </form>
          </div>
        )}

        {/* Settings View */}
        {activeTab === "settings" && (
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#8892B0]" /> Wallet Security & Settings
            </h2>

            <div className="p-3.5 rounded-xl bg-[#141824] border border-[#20283E]">
              <div className="text-xs font-semibold mb-1 flex items-center gap-1 text-[#00F0FF]">
                <ShieldCheck className="w-4 h-4" /> Post-Quantum Registration
              </div>
              <p className="text-[11px] text-[#8892B0] mb-2">
                Your account is protected by NIST ML-DSA-87 Dilithium-5 signatures on QoreChain EVM Lane.
              </p>
              <div className="text-[10px] font-mono bg-[#0B0E14] p-2 rounded border border-[#20283E] text-gray-300 break-all">
                Key Hash: {pqcHash || "0x9f83e201..."}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141824] border border-[#20283E]">
              <div className="text-xs font-semibold mb-1 flex items-center gap-1 text-white">
                <KeyRound className="w-4 h-4 text-[#9939FF]" /> Recovery Seed Phrase
              </div>
              <p className="text-[11px] text-[#8892B0] mb-2">
                Non-custodial sovereign backup. Never share your 12 words with anyone.
              </p>
              <button
                onClick={() => alert("Keep your 12-word seed secret and stored securely offline.")}
                className="w-full py-2 bg-[#20283E] hover:bg-[#2A3450] text-xs font-medium rounded-lg text-white transition-colors"
              >
                View Recovery Words
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="grid grid-cols-4 border-t border-[#20283E] bg-[#141824]/80 backdrop-blur-md py-2">
        <button
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors ${
            activeTab === "home" ? "text-[#00F0FF] font-semibold" : "text-[#8892B0]"
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Wallet</span>
        </button>
        <button
          onClick={() => setActiveTab("send")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors ${
            activeTab === "send" ? "text-[#00F0FF] font-semibold" : "text-[#8892B0]"
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Send</span>
        </button>
        <button
          onClick={() => setActiveTab("swap")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors ${
            activeTab === "swap" ? "text-[#00F0FF] font-semibold" : "text-[#8892B0]"
          }`}
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>Swap</span>
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors ${
            activeTab === "settings" ? "text-[#00F0FF] font-semibold" : "text-[#8892B0]"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
};

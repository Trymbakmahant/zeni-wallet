import React, { useState } from "react";
import {
  ShieldCheck,
  Send,
  ArrowUpDown,
  QrCode,
  Flame,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  RotateCw,
} from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { SendModal } from "./SendModal";
import { ReceiveModal } from "./ReceiveModal";
import { SwapModal } from "./SwapModal";
import { ApprovalModal } from "./ApprovalModal";

export const PortfolioView: React.FC = () => {
  const { activeAddress, cosmosAddress, tokens, activeModal, openModal, pendingApprovals, refreshState } = useWallet();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshState();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  };

  const copyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalUsd = tokens
    .reduce((acc, t) => acc + parseFloat(t.usdValue.replace("$", "").replace(",", "")), 0)
    .toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="flex flex-col h-full space-y-4 overflow-y-auto pr-1">
      {/* Top Address & Network Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-[11px] font-semibold text-[#8892B0]">QoreChain Diana</span>
          <button
            onClick={handleRefresh}
            title="Refresh Live On-Chain Balance"
            className="p-1 rounded-md hover:bg-[#1E2638] text-[#8892B0] hover:text-[#00F0FF] transition-all ml-0.5"
          >
            <RotateCw className={`w-3 h-3 ${refreshing ? "animate-spin text-[#00F0FF]" : ""}`} />
          </button>
        </div>

        {/* Copy Address Pill */}
        <button
          onClick={copyAddress}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141824] hover:bg-[#1E2638] text-xs font-mono transition-colors border border-[#20283E] text-gray-300"
          title="Click to copy 0x address"
        >
          {activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : "Loading..."}
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-[#8892B0]" />}
        </button>
      </div>

      {/* Portfolio Balance Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#1E253B] to-[#141824] p-5 border border-[#20283E] shadow-2xl">
        <div className="absolute top-0 right-0 p-3 opacity-15 pointer-events-none">
          <ShieldCheck className="w-24 h-24 text-[#00F0FF]" />
        </div>
        <span className="text-xs uppercase tracking-wider text-[#8892B0] font-semibold">Total Portfolio</span>
        <div className="text-3xl font-extrabold tracking-tight mt-1 text-white">{totalUsd}</div>
        <div className="flex items-center gap-1.5 mt-2.5 text-xs text-[#00F0FF]">
          <Sparkles className="w-3.5 h-3.5 text-[#00F0FF]" />
          <span>ML-DSA-87 Quantum Vault Protected</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => openModal("send")}
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-[#141824] hover:bg-[#1C2237] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium"
        >
          <div className="w-9 h-9 rounded-full bg-[#9939FF]/20 flex items-center justify-center mb-1 text-[#9939FF]">
            <Send className="w-4 h-4" />
          </div>
          <span>Send</span>
        </button>

        <button
          onClick={() => openModal("receive")}
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-[#141824] hover:bg-[#1C2237] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium"
        >
          <div className="w-9 h-9 rounded-full bg-[#00F0FF]/20 flex items-center justify-center mb-1 text-[#00F0FF]">
            <QrCode className="w-4 h-4" />
          </div>
          <span>Receive</span>
        </button>

        <button
          onClick={() => openModal("swap")}
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-[#141824] hover:bg-[#1C2237] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium"
        >
          <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center mb-1 text-indigo-400">
            <ArrowUpDown className="w-4 h-4" />
          </div>
          <span>Swap</span>
        </button>

        <a
          href="https://build.qorechain.io"
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-[#141824] hover:bg-[#1C2237] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium"
        >
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center mb-1 text-emerald-400">
            <Flame className="w-4 h-4" />
          </div>
          <span>Faucet</span>
        </a>
      </div>

      {/* Asset Token List */}
      <div>
        <div className="flex justify-between items-center mb-2 px-1">
          <span className="text-xs font-semibold text-[#8892B0] uppercase tracking-wider">Your Assets</span>
          <span className="text-[10px] text-[#00F0FF] font-mono">QoreChain Diana</span>
        </div>
        <div className="flex flex-col gap-2">
          {tokens.map((token) => (
            <div
              key={token.symbol}
              onClick={() => openModal("send")}
              className="flex items-center justify-between p-3 rounded-2xl bg-[#141824] hover:bg-[#1C2338] border border-[#20283E] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{token.icon}</span>
                <div>
                  <div className="font-semibold text-sm leading-tight text-white">{token.symbol}</div>
                  <div className="text-[11px] text-[#8892B0]">{token.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm leading-tight text-white font-mono">{token.balance}</div>
                <div className="text-[11px] text-[#8892B0]">{token.usdValue}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {activeModal === "send" && <SendModal />}
      {activeModal === "receive" && <ReceiveModal />}
      {activeModal === "swap" && <SwapModal />}
      {pendingApprovals.length > 0 && <ApprovalModal />}
    </div>
  );
};

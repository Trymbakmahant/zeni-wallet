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
  RotateCw,
} from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";
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
    .reduce((acc, t) => acc + (parseFloat(t.usdValue.replace("$", "").replace(",", "")) || 0), 0)
    .toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="flex flex-col space-y-4 pb-3">
      {/* Top Address & Network Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-[11px] font-semibold text-[#8892B0]">QoreChain Diana</span>
          <button
            onClick={handleRefresh}
            title="Refresh Live On-Chain Balance"
            className="p-1 rounded-md hover:bg-[#1E2638] text-[#8892B0] hover:text-[#00F0FF] transition-all ml-0.5 cursor-pointer"
          >
            <RotateCw className={`w-3 h-3 ${refreshing ? "animate-spin text-[#00F0FF]" : ""}`} />
          </button>
        </div>

        {/* Copy Address Pill */}
        <button
          onClick={copyAddress}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141824] hover:bg-[#1E2638] text-xs font-mono transition-colors border border-[#20283E] text-gray-300 cursor-pointer"
          title="Click to copy 0x address"
        >
          {activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : "Loading..."}
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-[#8892B0]" />}
        </button>
      </div>

      {/* Portfolio Balance Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#161D2F] via-[#111726] to-[#0A0E18] p-5 border border-[#222B42] shadow-xl shrink-0">
        <div className="absolute top-0 right-0 p-3 opacity-15 pointer-events-none">
          <ShieldCheck className="w-24 h-24 text-[#00F0FF]" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-[#8892B0] font-semibold">Total Portfolio</span>
          <span className="text-[10px] bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> PQC Protected
          </span>
        </div>
        <div className="text-3xl font-extrabold tracking-tight mt-1.5 text-white font-mono">
          {totalUsd}
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 text-xs text-[#00F0FF]">
          <Sparkles className="w-3.5 h-3.5 text-[#00F0FF]" />
          <span>ML-DSA-87 Quantum Vault Active</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-4 gap-2 shrink-0">
        <button
          onClick={() => openModal("send")}
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-[#121624] hover:bg-[#1A2033] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-[#9939FF]/15 text-[#B366FF] flex items-center justify-center mb-1.5">
            <Send className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-medium text-gray-200">Send</span>
        </button>

        <button
          onClick={() => openModal("receive")}
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-[#121624] hover:bg-[#1A2033] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-[#00F0FF]/15 text-[#00F0FF] flex items-center justify-center mb-1.5">
            <QrCode className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-medium text-gray-200">Receive</span>
        </button>

        <button
          onClick={() => openModal("swap")}
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-[#121624] hover:bg-[#1A2033] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center mb-1.5">
            <ArrowUpDown className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-medium text-gray-200">Swap</span>
        </button>

        <a
          href="https://build.qorechain.io"
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-[#121624] hover:bg-[#1A2033] border border-[#20283E] transition-all hover:scale-[1.02] text-xs font-medium cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-1.5">
            <Flame className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-medium text-gray-200">Faucet</span>
        </a>
      </div>

      {/* Asset Token List */}
      <div className="pt-1">
        <div className="flex justify-between items-center mb-2.5 px-1">
          <span className="text-xs font-semibold text-[#8892B0] uppercase tracking-wider">Your Assets</span>
          <span className="text-[10px] text-[#00F0FF] font-mono">QoreChain Diana</span>
        </div>
        <div className="flex flex-col gap-2">
          {tokens.map((token) => (
            <div
              key={token.symbol}
              onClick={() => openModal("send")}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-[#121624] hover:bg-[#181E30] border border-[#20283E] transition-all hover:border-[#2C3754] cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <CryptoIcon symbol={token.symbol} className="w-9 h-9 shrink-0 transition-transform group-hover:scale-105 shadow-sm" />
                <div>
                  <div className="font-bold text-sm leading-tight text-white">{token.symbol}</div>
                  <div className="text-[11px] text-[#8892B0] mt-0.5">{token.name}</div>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-sm leading-tight text-white">{token.balance}</div>
                <div className="text-[11px] text-[#8892B0] mt-0.5">{token.usdValue}</div>
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

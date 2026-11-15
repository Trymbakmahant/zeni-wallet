import React, { useState } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowUpDown,
  RotateCw,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { CryptoIcon } from "../components/CryptoIcon";
import { SendModal } from "./SendModal";
import { ReceiveModal } from "./ReceiveModal";
import { SwapModal } from "./SwapModal";
import { ApprovalModal } from "./ApprovalModal";

export const PortfolioView: React.FC = () => {
  const { tokens, activeModal, openModal, pendingApprovals, refreshState } = useWallet();
  const [activeSubTab, setActiveSubTab] = useState<"tokens" | "defi" | "nfts">("tokens");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshState();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  };

  const totalUsd = tokens
    .reduce((acc, t) => acc + (parseFloat(t.usdValue.replace("$", "").replace(",", "")) || 0), 0)
    .toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="flex flex-col space-y-3 pb-3">
      {/* 1. Hero Balance Section - MetaMask Style */}
      <div className="pt-2 pb-1 px-1">
        <div className="text-[38px] font-bold tracking-tight text-white font-sans leading-none">
          {totalUsd}
        </div>
        <div className="flex items-center gap-2 text-xs mt-2 font-medium">
          <span className="text-emerald-400 font-mono">+$0.00 (+0.00%)</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400 text-[11px] flex items-center gap-1 font-mono">
            <Sparkles className="w-3 h-3 text-[#E06341]" /> ML-DSA-87 Protected
          </span>
        </div>
      </div>

      {/* 2. Action Buttons Row: Send | Receive | Swap (MetaMask Squircles) */}
      <div className="grid grid-cols-3 gap-2.5 pt-1 pb-1">
        {/* Send */}
        <button
          onClick={() => openModal("send")}
          className="flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl bg-[#141417] hover:bg-[#1E1E22] border border-[#222226] transition-all hover:scale-[1.02] cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white mb-1 group-hover:scale-110 transition-transform">
            <ArrowUpRight className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-semibold text-white">Send</span>
        </button>

        {/* Receive */}
        <button
          onClick={() => openModal("receive")}
          className="flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl bg-[#141417] hover:bg-[#1E1E22] border border-[#222226] transition-all hover:scale-[1.02] cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white mb-1 group-hover:scale-110 transition-transform">
            <ArrowDownLeft className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-semibold text-white">Receive</span>
        </button>

        {/* Swap */}
        <button
          onClick={() => openModal("swap")}
          className="flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl bg-[#141417] hover:bg-[#1E1E22] border border-[#222226] transition-all hover:scale-[1.02] cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white mb-1 group-hover:scale-110 transition-transform">
            <ArrowUpDown className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs font-semibold text-white">Swap</span>
        </button>
      </div>

      {/* 3. Faucet Card (MetaMask Money/Yield style) */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#111114] border border-[#222226] my-1">
        <div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-white">Diana Faucet</span>
            <span className="text-[#E06341] font-mono font-medium text-[10px] bg-[#E06341]/10 px-1.5 py-0.2 rounded-full">
              Testnet
            </span>
          </div>
          <div className="text-xs font-bold text-zinc-300 font-mono mt-0.5">
            Claim testnet QOR & tokens
          </div>
        </div>
        <a
          href="https://build.qorechain.io"
          target="_blank"
          rel="noreferrer"
          className="py-1.5 px-4 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-colors cursor-pointer"
        >
          Claim
        </a>
      </div>

      {/* 4. Tabs: Tokens | DeFi | NFTs (MetaMask style) */}
      <div className="flex items-center border-b border-[#1E1E22] pt-2 text-sm">
        <button
          onClick={() => setActiveSubTab("tokens")}
          className={`pb-2 px-1 font-semibold transition-colors mr-6 relative cursor-pointer ${
            activeSubTab === "tokens" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Tokens
          {activeSubTab === "tokens" && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveSubTab("defi")}
          className={`pb-2 px-1 font-semibold transition-colors mr-6 relative cursor-pointer ${
            activeSubTab === "defi" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          DeFi
          {activeSubTab === "defi" && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveSubTab("nfts")}
          className={`pb-2 px-1 font-semibold transition-colors relative cursor-pointer ${
            activeSubTab === "nfts" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          NFTs
          {activeSubTab === "nfts" && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-full" />
          )}
        </button>
      </div>

      {/* 5. Sub-Tab Content */}
      {activeSubTab === "tokens" && (
        <div className="space-y-2 pt-1">
          {/* Network Filter Pill (MetaMask style) */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#141416] border border-[#222226] text-[11px] text-zinc-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>QoreChain Diana</span>
            </div>

            <button
              onClick={handleRefresh}
              title="Refresh balances"
              className="p-1 rounded-lg hover:bg-[#141416] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#E06341]" : ""}`} />
            </button>
          </div>

          {/* Token List (MetaMask style borderless list with hover) */}
          <div className="flex flex-col divide-y divide-[#18181B]/60">
            {tokens.map((token) => (
              <div
                key={token.symbol}
                onClick={() => openModal("send")}
                className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-[#121215] transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <CryptoIcon
                      symbol={token.symbol}
                      className="w-9 h-9 shrink-0 transition-transform group-hover:scale-105"
                    />
                    {/* Small network badge on bottom right of token icon */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-black border border-[#222226] flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E06341]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-sm text-white leading-tight">
                        {token.name}
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#E06341]" />
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5 leading-none">
                      +0.00%
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-sm leading-tight text-white">{token.usdValue}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 leading-none">
                    {token.balance} {token.symbol}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === "defi" && (
        <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-1">
          <span className="font-medium text-zinc-400">No DeFi positions found</span>
          <span>Interact with QoreChain DEX pools or liquidity vaults to view positions here.</span>
        </div>
      )}

      {activeSubTab === "nfts" && (
        <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-1">
          <span className="font-medium text-zinc-400">No NFTs yet</span>
          <span>Minted or transferred post-quantum NFTs on QoreChain will appear here.</span>
        </div>
      )}

      {/* Modals */}
      {activeModal === "send" && <SendModal />}
      {activeModal === "receive" && <ReceiveModal />}
      {activeModal === "swap" && <SwapModal />}
      {pendingApprovals.length > 0 && <ApprovalModal />}
    </div>
  );
};

import React, { useState } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { OnboardingView } from "./views/OnboardingView";
import { UnlockView } from "./views/UnlockView";
import { PortfolioView } from "./views/PortfolioView";
import { ActivityView } from "./views/ActivityView";
import { SettingsView } from "./views/SettingsView";
import { TradeView } from "./views/TradeView";
import { AppsView } from "./views/AppsView";
import { AccountSwitcher } from "./components/AccountSwitcher";
import { StartupScreen } from "./components/StartupScreen";
import { Home, ArrowLeftRight, LayoutGrid, Clock, Settings, ShieldCheck, Lock, Copy, Check } from "lucide-react";

const MainLayout: React.FC = () => {
  const { isInitialized, isLocked, pendingApprovals, pendingRelease, lock, activeAddress } = useWallet();
  const [dismissedRelease, setDismissedRelease] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "trade" | "apps" | "activity" | "settings">("home");
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isInitialized) {
    return <OnboardingView />;
  }

  if (pendingRelease && pendingRelease !== dismissedRelease && !pendingApprovals.length && new URLSearchParams(location.search).get("approval") !== "1") {
    return <main className="flex h-full flex-col justify-center gap-5 bg-black px-6 text-white">
      <span className="text-xs font-mono uppercase tracking-wider text-[#E06341]">Zeni Wallet updated</span>
      <h1 className="text-3xl font-semibold">What's new in {pendingRelease}</h1>
      {pendingRelease === "0.1.6" && <ul className="list-disc space-y-3 pl-5 text-sm text-zinc-300">
        <li>When creating or importing a wallet, choose a password of at least 6 characters. A longer, unique password is safer.</li>
        <li>Setup now explains when a password is too short or the confirmation does not match. Your current password still works.</li>
      </ul>}
      <p className="text-sm text-zinc-400">Your existing wallet is still on this device. No setup or recovery phrase is needed.</p>
      <button className="rounded-xl bg-white px-4 py-3 font-semibold text-black" onClick={() => {
        setDismissedRelease(pendingRelease);
        void chrome.storage.local.set({ lastSeenRelease: pendingRelease }).catch(() => {});
      }}>{isLocked ? "Continue to unlock" : "Continue to wallet"}</button>
    </main>;
  }

  if (isLocked) {
    return <UnlockView />;
  }

  return (
    <div className="flex flex-col h-full bg-[#000000] text-white">
      {/* Extension Header - MetaMask Style */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#18181B] bg-[#000000] select-none shrink-0">
        <div className="flex flex-col">
          <AccountSwitcher />
          {/* Truncated address copy pill */}
          <button
            onClick={copyAddress}
            className="flex items-center gap-1.5 px-2 py-0.5 mt-0.5 rounded-full bg-[#121214] hover:bg-[#1A1A1E] border border-[#222226] text-[11px] font-mono text-zinc-300 transition-colors cursor-pointer w-fit"
            title="Click to copy address"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{activeAddress ? `${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)}` : "0x..."}</span>
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-500" />}
          </button>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-[#D45D3E]/15 text-[#E06341] border border-[#D45D3E]/30 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#E06341]" /> Testnet
          </span>
          <button
            onClick={lock}
            title="Lock Wallet"
            className="w-8 h-8 rounded-xl bg-[#141416] hover:bg-[#1E1E22] border border-[#222226] flex items-center justify-center text-zinc-300 transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main key={activeAddress} className="flex-1 overflow-y-auto px-4 py-3 bg-[#000000]">
        {activeTab === "home" && <PortfolioView />}
        {activeTab === "trade" && <TradeView />}
        {activeTab === "apps" && <AppsView />}
        {activeTab === "activity" && <ActivityView />}
        {activeTab === "settings" && <SettingsView />}
      </main>

      {/* Bottom Nav: Home | Trade | Apps | Activity | Settings */}
      <nav className="grid grid-cols-5 border-t border-[#18181B] bg-[#000000] py-2.5 px-2 select-none shrink-0">
        <button
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors cursor-pointer ${
            activeTab === "home" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Home className={`w-4 h-4 ${activeTab === "home" ? "text-[#E06341]" : ""}`} />
          <span>Home</span>
        </button>

        <button
          onClick={() => setActiveTab("trade")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors cursor-pointer ${
            activeTab === "trade" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <ArrowLeftRight className={`w-4 h-4 ${activeTab === "trade" ? "text-[#E06341]" : ""}`} />
          <span>Trade</span>
        </button>

        <button
          onClick={() => setActiveTab("apps")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors cursor-pointer ${
            activeTab === "apps" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <LayoutGrid className={`w-4 h-4 ${activeTab === "apps" ? "text-[#E06341]" : ""}`} />
          <span>Apps</span>
        </button>

        <button
          onClick={() => setActiveTab("activity")}
          className={`relative flex flex-col items-center gap-1 text-[11px] transition-colors cursor-pointer ${
            activeTab === "activity" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Clock className={`w-4 h-4 ${activeTab === "activity" ? "text-[#E06341]" : ""}`} />
          <span>Activity</span>
          {pendingApprovals.length > 0 && (
            <span className="absolute top-0 right-7 w-2 h-2 rounded-full bg-[#E06341] animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors cursor-pointer ${
            activeTab === "settings" ? "text-white font-semibold" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Settings className={`w-4 h-4 ${activeTab === "settings" ? "text-[#E06341]" : ""}`} />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <WalletProvider>
      <StartupScreen>
        <MainLayout />
      </StartupScreen>
    </WalletProvider>
  );
};

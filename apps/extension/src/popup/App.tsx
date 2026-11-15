import React, { useState } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { OnboardingView } from "./views/OnboardingView";
import { UnlockView } from "./views/UnlockView";
import { PortfolioView } from "./views/PortfolioView";
import { ActivityView } from "./views/ActivityView";
import { SettingsView } from "./views/SettingsView";
import { Wallet, Clock, Settings, ShieldCheck, Lock } from "lucide-react";

const MainLayout: React.FC = () => {
  const { isInitialized, isLocked, pendingApprovals, lock } = useWallet();
  const [activeTab, setActiveTab] = useState<"wallet" | "activity" | "settings">("wallet");

  if (!isInitialized) {
    return <OnboardingView />;
  }

  if (isLocked) {
    return <UnlockView />;
  }

  return (
    <div className="flex flex-col h-full bg-[#000000] text-white">
      {/* Extension Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#1C1C20] bg-[#000000]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center bg-black shadow-sm">
            <div className="w-2 h-2 border-[1.5px] border-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm leading-tight text-white">Zeni</span>
              <span className="text-[10px] bg-[#D45D3E]/15 text-[#E06341] border border-[#D45D3E]/30 px-1.5 py-0.2 rounded-full font-mono flex items-center gap-0.5">
                <ShieldCheck className="w-2.5 h-2.5 text-[#E06341]" /> PQC Active
              </span>
            </div>
            <span className="text-[10px] text-[#A1A1AA] font-mono leading-none">EVM 9800</span>
          </div>
        </div>

        <button
          onClick={lock}
          title="Lock Wallet"
          className="w-7 h-7 rounded-lg bg-[#141416] hover:bg-[#222226] border border-[#27272A] flex items-center justify-center text-gray-300 transition-colors cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-3 bg-[#000000]">
        {activeTab === "wallet" && <PortfolioView />}
        {activeTab === "activity" && <ActivityView />}
        {activeTab === "settings" && <SettingsView />}
      </main>

      {/* Bottom Nav */}
      <nav className="grid grid-cols-3 border-t border-[#1C1C20] bg-[#000000] py-2 px-2">
        <button
          onClick={() => setActiveTab("wallet")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors cursor-pointer ${
            activeTab === "wallet" ? "text-white font-semibold" : "text-[#71717A] hover:text-gray-300"
          }`}
        >
          <Wallet className={`w-4 h-4 ${activeTab === "wallet" ? "text-[#E06341]" : ""}`} />
          <span>Wallet</span>
        </button>

        <button
          onClick={() => setActiveTab("activity")}
          className={`relative flex flex-col items-center gap-1 text-[11px] transition-colors cursor-pointer ${
            activeTab === "activity" ? "text-white font-semibold" : "text-[#71717A] hover:text-gray-300"
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
            activeTab === "settings" ? "text-white font-semibold" : "text-[#71717A] hover:text-gray-300"
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
      <MainLayout />
    </WalletProvider>
  );
};

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
    <div className="flex flex-col h-full bg-[#0B0E14] text-white">
      {/* Extension Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#20283E] bg-[#141824]/50 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#9939FF] to-[#00F0FF] flex items-center justify-center font-bold text-sm shadow-lg shadow-[#9939FF]/20">
            銭
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm leading-tight">Zeni</span>
              <span className="text-[10px] bg-[#9939FF]/20 text-[#00F0FF] border border-[#00F0FF]/30 px-1.5 py-0.2 rounded-full font-mono flex items-center gap-0.5">
                <ShieldCheck className="w-2.5 h-2.5 text-[#00F0FF]" /> PQC Active
              </span>
            </div>
            <span className="text-[10px] text-[#8892B0] font-mono leading-none">EVM 9800</span>
          </div>
        </div>

        <button
          onClick={lock}
          title="Lock Wallet"
          className="w-7 h-7 rounded-lg bg-[#20283E] hover:bg-[#2A3450] flex items-center justify-center text-gray-300 transition-colors"
        >
          <Lock className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-3">
        {activeTab === "wallet" && <PortfolioView />}
        {activeTab === "activity" && <ActivityView />}
        {activeTab === "settings" && <SettingsView />}
      </main>

      {/* Bottom Nav */}
      <nav className="grid grid-cols-3 border-t border-[#20283E] bg-[#141824]/80 backdrop-blur-md py-2 px-2">
        <button
          onClick={() => setActiveTab("wallet")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors ${
            activeTab === "wallet" ? "text-[#00F0FF] font-semibold" : "text-[#8892B0] hover:text-gray-300"
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Wallet</span>
        </button>

        <button
          onClick={() => setActiveTab("activity")}
          className={`relative flex flex-col items-center gap-1 text-[11px] transition-colors ${
            activeTab === "activity" ? "text-[#00F0FF] font-semibold" : "text-[#8892B0] hover:text-gray-300"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Activity</span>
          {pendingApprovals.length > 0 && (
            <span className="absolute top-0 right-7 w-2 h-2 rounded-full bg-[#9939FF] animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex flex-col items-center gap-1 text-[11px] transition-colors ${
            activeTab === "settings" ? "text-[#00F0FF] font-semibold" : "text-[#8892B0] hover:text-gray-300"
          }`}
        >
          <Settings className="w-4 h-4" />
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

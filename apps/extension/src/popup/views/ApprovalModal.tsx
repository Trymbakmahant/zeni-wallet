import React from "react";
import { ShieldAlert, Globe, Check, X, ShieldCheck, Fuel } from "lucide-react";
import { useWallet } from "../context/WalletContext";

export const ApprovalModal: React.FC = () => {
  const { pendingApprovals, resolveApproval, activeAddress } = useWallet();

  if (pendingApprovals.length === 0) return null;
  const current = pendingApprovals[0];

  const isConnect = current.payload.method === "eth_requestAccounts";
  const isSend = current.payload.method === "eth_sendTransaction";

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex flex-col justify-between p-5 text-white animate-fade-in">
      <div>
        {/* Origin Header */}
        <div className="flex flex-col items-center pt-2 pb-4 text-center border-b border-[#222226]">
          <div className="w-12 h-12 rounded-2xl bg-[#141416] border border-[#222226] flex items-center justify-center mb-2 shadow-lg">
            <Globe className="w-6 h-6 text-[#E06341]" />
          </div>
          <h2 className="font-bold text-base text-white">{current.title || "External Application"}</h2>
          <span className="text-xs font-mono text-[#E06341] break-all">{current.origin}</span>
        </div>

        {/* Content Details */}
        <div className="py-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 uppercase font-semibold">
            <ShieldAlert className="w-4 h-4 text-[#E06341]" />
            <span>Requested Action: {current.payload.method}</span>
          </div>

          {isConnect && (
            <div className="p-3.5 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2">
              <span className="text-xs text-zinc-400">Connect account:</span>
              <div className="font-mono text-xs font-semibold text-white break-all bg-black p-2 rounded-lg border border-[#222226]">
                {activeAddress}
              </div>
              <ul className="text-[11px] text-zinc-400 space-y-1 pt-1 list-disc list-inside">
                <li>View your account address & balances</li>
                <li>Signing and dApp transactions are unavailable in this release</li>
              </ul>
            </div>
          )}

          {isSend && (
            <div className="p-3.5 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2">
              <span className="text-xs text-zinc-400">Transaction Details:</span>
              <div className="text-xs font-mono bg-black p-2 rounded-lg border border-[#222226] overflow-x-auto text-zinc-300">
                <pre>{JSON.stringify(current.payload.params, null, 2)}</pre>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <Fuel className="w-3.5 h-3.5 text-[#E06341]" />
                <span>Standard QOR Network Fee</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#222226]">
        <button
          onClick={() => resolveApproval(current.internalId, false)}
          className="py-3 rounded-xl bg-[#141416] hover:bg-[#1E1E22] border border-[#27272A] font-semibold text-sm text-zinc-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" /> Reject
        </button>
        <button
          onClick={() => resolveApproval(current.internalId, true)}
          className="py-3 rounded-xl bg-[#E06341] hover:bg-[#EB6841] font-semibold text-sm text-white flex items-center justify-center gap-1.5 shadow-lg shadow-[#E06341]/20 transition-all cursor-pointer"
        >
          <Check className="w-4 h-4" /> Approve
        </button>
      </div>
    </div>
  );
};

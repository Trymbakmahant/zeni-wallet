import React from "react";
import { ShieldAlert, Globe, Check, X, ShieldCheck, Flame } from "lucide-react";
import { useWallet } from "../context/WalletContext";

export const ApprovalModal: React.FC = () => {
  const { pendingApprovals, resolveApproval, activeAddress } = useWallet();

  if (pendingApprovals.length === 0) return null;
  const current = pendingApprovals[0];

  const isConnect = current.payload.method === "eth_requestAccounts";
  const isSend = current.payload.method === "eth_sendTransaction";

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col justify-between p-5 text-white animate-fade-in">
      <div>
        {/* Origin Header */}
        <div className="flex flex-col items-center pt-2 pb-4 text-center border-b border-[#20283E]">
          <div className="w-12 h-12 rounded-2xl bg-[#20283E] flex items-center justify-center mb-2 shadow-lg">
            {current.favIconUrl ? (
              <img src={current.favIconUrl} alt="favicon" className="w-6 h-6 rounded" />
            ) : (
              <Globe className="w-6 h-6 text-[#00F0FF]" />
            )}
          </div>
          <h2 className="font-bold text-base">{current.title || "External Application"}</h2>
          <span className="text-xs font-mono text-[#00F0FF]">{current.origin}</span>
        </div>

        {/* Content Details */}
        <div className="py-4 space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-[#8892B0] uppercase font-semibold">
            <ShieldAlert className="w-4 h-4 text-[#9939FF]" />
            <span>Requested Action: {current.payload.method}</span>
          </div>

          {isConnect && (
            <div className="p-3.5 rounded-2xl bg-[#141824] border border-[#20283E] space-y-2">
              <span className="text-xs text-[#8892B0]">Connect account:</span>
              <div className="font-mono text-xs font-semibold text-white break-all bg-[#0B0E14] p-2 rounded-lg border border-[#20283E]">
                {activeAddress}
              </div>
              <ul className="text-[11px] text-[#8892B0] space-y-1 pt-1 list-disc list-inside">
                <li>View your account address & balances</li>
                <li>Request transaction signatures for approvals</li>
              </ul>
            </div>
          )}

          {isSend && (
            <div className="p-3.5 rounded-2xl bg-[#141824] border border-[#20283E] space-y-2">
              <span className="text-xs text-[#8892B0]">Transaction Details:</span>
              <div className="text-xs font-mono bg-[#0B0E14] p-2 rounded-lg border border-[#20283E] overflow-x-auto text-gray-300">
                <pre>{JSON.stringify(current.payload.params, null, 2)}</pre>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[#00F0FF]">
                <Flame className="w-3.5 h-3.5" />
                <span>Gas sponsored by ZeniPaymaster</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#20283E]">
        <button
          onClick={() => resolveApproval(current.internalId, false)}
          className="py-3 rounded-xl bg-[#141824] hover:bg-[#1C2237] border border-[#20283E] font-semibold text-sm text-gray-300 flex items-center justify-center gap-1.5 transition-colors"
        >
          <X className="w-4 h-4" /> Reject
        </button>
        <button
          onClick={() => resolveApproval(current.internalId, true)}
          className="py-3 rounded-xl bg-gradient-to-r from-[#9939FF] to-[#00F0FF] font-semibold text-sm text-white flex items-center justify-center gap-1.5 shadow-lg shadow-[#00F0FF]/15 transition-all hover:opacity-95"
        >
          <Check className="w-4 h-4" /> Approve
        </button>
      </div>
    </div>
  );
};

import React from "react";
import { Send, ArrowUpDown, ExternalLink, Clock, CheckCircle2, Flame } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { QORECHAIN_CONFIG } from "@zeni/core";

export const ActivityView: React.FC = () => {
  const { activity } = useWallet();

  const explorerBase = QORECHAIN_CONFIG.blockExplorerUrls[0];

  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-base font-bold text-white">Activity History</h2>
        <span className="text-[11px] text-zinc-400 font-mono">{activity.length} Records</span>
      </div>

      {activity.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
          <div className="w-12 h-12 rounded-full bg-[#141416] border border-[#222226] flex items-center justify-center text-zinc-500">
            <Clock className="w-6 h-6" />
          </div>
          <span className="text-sm font-semibold text-zinc-300">No Transactions Yet</span>
          <p className="text-xs text-zinc-400 max-w-xs">
            Send tokens or execute an in-wallet swap to see your on-chain activity here.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {activity.map((item, idx) => (
            <div
              key={item.hash || idx}
              className="p-3 rounded-2xl bg-[#0D0D10] border border-[#222226] flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-black border border-[#222226] flex items-center justify-center">
                  {item.type === "SEND" ? (
                    <Send className="w-4 h-4 text-[#E06341]" />
                  ) : (
                    <ArrowUpDown className="w-4 h-4 text-[#E06341]" />
                  )}
                </div>
                <div>
                  <div className="font-semibold text-xs leading-tight text-white">
                    {item.type === "SEND"
                      ? `Sent ${item.amount} ${item.token}`
                      : `Swapped ${item.amountIn} ${item.tokenIn} → ${item.amountOut} ${item.tokenOut}`}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1.5 mt-0.5">
                    <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>•</span>
                    <span className="text-[#E06341] flex items-center gap-0.5">
                      <Flame className="w-3 h-3 text-[#E06341]" /> Free Gas
                    </span>
                  </div>
                </div>
              </div>

              <a
                href={`${explorerBase}/tx/${item.hash}`}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 hover:text-white p-1"
                title="View on Explorer"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

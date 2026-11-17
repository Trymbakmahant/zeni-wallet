import React from "react";
import { Send, ArrowUpDown, ExternalLink, Clock, Trash2, Fuel } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { TransactionExplorerLink } from "../components/TransactionExplorerLink";

export const ActivityView: React.FC = () => {
  const { activity, clearActivity } = useWallet();


  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-base font-bold text-white">Activity History</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400 font-mono">{activity.length} Records</span>
          {activity.length > 0 && (
            <button
              onClick={() => clearActivity()}
              className="text-xs text-zinc-400 hover:text-[#E06341] transition-colors p-1 rounded cursor-pointer"
              title="Clear activity log"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
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
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-black border border-[#222226] flex items-center justify-center">
                  {item.type === "SEND" ? (
                    <Send className="w-4 h-4 text-[#E06341]" />
                  ) : (
                    <ArrowUpDown className="w-4 h-4 text-[#E06341]" />
                  )}
                </div>
                <div className="min-w-0 break-words">
                  <div className="font-semibold text-xs leading-tight text-white">
                    {item.type === "SETUP" ? "PQC setup" : item.type === "SEND"
                      ? `${item.status === "CONFIRMED" ? "Sent" : "Send"} ${item.amount} ${item.token}`
                      : `${!item.nativeChain ? "Demo swap" : item.status === "CONFIRMED" ? "Swapped" : "Swap"} ${item.amountIn} ${item.tokenIn} → ${item.status === "CONFIRMED" ? item.amountOut ?? (item.minAmountOut ? `≥ ${item.minAmountOut}` : "—") : ""} ${item.tokenOut}`}
                  </div>
                  <div className={`text-[10px] mt-1 ${item.status === "FAILED" ? "text-red-400" : item.status === "PENDING" ? "text-amber-400" : "text-emerald-400"}`}>
                    {item.type === "SWAP" && !item.nativeChain ? "DEMO · Not on chain" : item.status}{item.nativeChain ? " · Testnet" : ""}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1.5 mt-0.5">
                    <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>•</span>
                    <span className="text-zinc-500 font-mono flex items-center gap-1">
                      <Fuel className="w-3 h-3 text-[#E06341]" /> {item.type === "SWAP" && !item.nativeChain ? "No network transaction" : item.gasCost || "~0.0030 QOR"}
                    </span>
                  </div>
                </div>
              </div>

              {(item.type !== "SWAP" || item.nativeChain) && <TransactionExplorerLink hash={item.hash} className="text-zinc-400 hover:text-white p-1 text-[10px] flex items-center gap-1" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from "react";
import { Send, ArrowDownLeft, ArrowUpDown, Clock, Trash2, RefreshCw } from "lucide-react";
import { useWallet, type ActivityItem } from "../context/WalletContext";
import { TransactionExplorerLink } from "../components/TransactionExplorerLink";

function title(item: ActivityItem) {
  if (item.status === 'FAILED') return 'Failed transaction';
  if (item.type === 'SETUP') return 'PQC setup';
  if (item.type === 'SELF') return 'Transfer to yourself';
  if (item.type === 'SWAP') return item.tokenIn && item.tokenOut
    ? `${item.status === 'CONFIRMED' ? 'Swapped' : 'Swap'} ${item.amountIn ?? '—'} ${item.tokenIn} → ${item.amountOut ?? '—'} ${item.tokenOut}` : 'Swap';
  const detail = item.transfers && item.transfers.length > 1 ? `${item.transfers.length} asset movements` : `${item.amount ?? '—'} ${item.token ?? ''}`;
  if (item.type === 'RECEIVE') return `Received ${detail}`;
  if (item.type === 'SEND') return `${item.status === 'CONFIRMED' ? 'Sent' : 'Send'} ${detail}`;
  return 'On-chain transaction';
}

export const ActivityView: React.FC = () => {
  const { activity, clearActivity, activeAddress, refreshActivity, activityLoading, activityError, activityHasMore, activityUpdatedAt } = useWallet();
  const refreshRef = useRef(refreshActivity);
  refreshRef.current = refreshActivity;
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  useEffect(() => {
    void refreshRef.current({ force: true });
    const timer = setInterval(() => { void refreshRef.current(); },30_000);
    return () => clearInterval(timer);
  },[activeAddress]);
  const clearLocal = async () => {
    try { await clearActivity(); setConfirmClear(false); setClearError(null); }
    catch { setClearError('Could not clear local activity. Please retry.'); }
  };
  return <div className="flex flex-col h-full space-y-3">
    <div className="flex justify-between items-center px-1">
      <h2 className="text-base font-bold text-white">Activity</h2>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void refreshActivity({force:true})} disabled={activityLoading}
          title="Refresh activity" aria-label="Refresh activity" className="p-2 rounded-lg text-zinc-400 hover:text-[#E06341] disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${activityLoading ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" onClick={() => setConfirmClear(value=>!value)} title="Clear local activity" aria-label="Clear local activity"
          className="p-2 rounded-lg text-zinc-400 hover:text-[#E06341]"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
    <p className="text-[10px] text-zinc-400 px-1">Incoming and outgoing activity on Diana Testnet.
      {activityUpdatedAt ? ` Updated ${new Date(activityUpdatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}.` : ''}</p>
    {activityError && <div role="alert" className="p-3 rounded-xl bg-amber-500/10 text-amber-300 text-xs">{activityError}</div>}
    {confirmClear && <div className="p-3 rounded-xl border border-[#27272A] text-xs text-zinc-300 space-y-2">
      <p>Clear completed local records? Pending transactions stay. Public on-chain activity will still appear.</p>
      {clearError && <p role="alert" className="text-red-400">{clearError}</p>}
      <div className="flex gap-3"><button type="button" onClick={() => void clearLocal()} className="text-[#E06341]">Clear local records</button>
        <button type="button" onClick={()=>setConfirmClear(false)}>Cancel</button></div>
    </div>}
    {!activity.length ? <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
      <Clock className="w-6 h-6 text-zinc-500" />
      <span role="status" className="text-sm font-semibold text-zinc-300">{activityLoading ? 'Checking the blockchain…' : activityError ? 'History is unavailable' : 'No activity found'}</span>
      <p className="text-xs text-zinc-400">{activityError ? 'Use Refresh to try again.' : 'Incoming payments, transfers, and swaps appear here once indexed.'}</p>
    </div> : <div className="flex-1 overflow-y-auto space-y-2 pr-1">
      {activity.map(item => <article key={item.hash.toLowerCase()} className="p-3 rounded-2xl bg-[#0D0D10] border border-[#222226] space-y-2">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 shrink-0 rounded-xl bg-black border border-[#222226] flex items-center justify-center">
            {item.type === 'RECEIVE' ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" /> : item.type === 'SEND' ? <Send className="w-4 h-4 text-[#E06341]" /> : <ArrowUpDown className="w-4 h-4 text-[#E06341]" />}
          </div>
          <div className="min-w-0 flex-1 break-words">
            <h3 className="font-semibold text-xs text-white">{title(item)}</h3>
            <p className={`text-[10px] mt-1 ${item.status === 'FAILED' ? 'text-red-400' : item.status === 'PENDING' ? 'text-amber-400' : 'text-emerald-400'}`}>
              {item.type === 'SWAP' && !item.nativeChain ? 'DEMO · Not on chain' : item.status}{item.source === 'chain' || item.source === 'merged' ? ' · On chain' : ' · Local record'}
            </p>
            {item.transfers && item.transfers.length > 1 && item.type !== 'SWAP' && <ul className="text-[10px] text-zinc-300 mt-1 space-y-1">
              {item.transfers.map((transfer,index)=><li key={index} className="break-all">{transfer.direction === 'in' ? '+' : transfer.direction === 'out' ? '−' : '↔'} {transfer.amount} {transfer.token}</li>)}
            </ul>}
            {(item.from || item.to) && <p className="text-[10px] text-zinc-500 font-mono mt-1 break-all">{item.from ? 'From' : 'To'} {item.from || item.to}</p>}
          </div>
        </div>
        <div className="text-[10px] text-zinc-500 flex flex-wrap justify-between gap-1">
          <time dateTime={new Date(item.timestamp).toISOString()}>{new Date(item.timestamp).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time>
          {item.gasCost && item.type !== 'RECEIVE' && <span>Fee {item.gasCost}</span>}
        </div>
        {(item.type !== 'SWAP' || item.nativeChain) && <TransactionExplorerLink hash={item.hash} className="text-zinc-400 hover:text-white text-[10px] inline-flex items-center gap-1" />}
      </article>)}
      {activityHasMore && <button type="button" disabled={activityLoading} onClick={()=>void refreshActivity({older:true})}
        className="w-full py-3 rounded-xl bg-[#18181C] text-xs text-white disabled:opacity-50">{activityLoading ? 'Loading…' : 'Load older activity'}</button>}
      <p className="text-[10px] text-zinc-500 p-2">Recent indexed activity, up to 500 chain transactions. Some contract-internal token movements may not be indexed here.</p>
    </div>}
  </div>;
};

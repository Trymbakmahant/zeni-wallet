import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { useWallet } from "../context/WalletContext";

export function AccountSwitcher() {
  const { accounts, activeAccountIndex, activeAddress, addAccount, switchAccount } = useWallet();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
      aria-label={`Account ${activeAccountIndex + 1}, switch account`}
      className="flex items-center gap-1 text-sm font-bold text-white hover:text-zinc-200">
      Account {activeAccountIndex + 1}<ChevronDown className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
    </button>
    {open && <AccountDialog accounts={accounts} activeAddress={activeAddress}
      addAccount={addAccount} switchAccount={switchAccount} onClose={() => setOpen(false)} />}
  </>;
}

type AccountDialogProps = Pick<ReturnType<typeof useWallet>, "accounts" | "activeAddress" | "addAccount" | "switchAccount"> & { onClose: () => void };
function AccountDialog({ accounts, activeAddress, addAccount, switchAccount, onClose }: AccountDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const run = async (operation: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await operation(); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "Account update failed. Try again."); }
    finally { setPassword(""); setBusy(false); inFlight.current = false; }
  };
  return <dialog ref={dialog} aria-labelledby="account-dialog-title" aria-describedby="account-dialog-description"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto w-[calc(100%_-_2rem)] max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-[#27272A] bg-[#0D0D10] p-4 text-white backdrop:bg-black/80">
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 id="account-dialog-title" className="text-sm font-semibold">{creating ? `Create Account ${accounts.length + 1}` : "Your accounts"}</h2>
      <button type="button" aria-label="Close account selector" disabled={busy} onClick={onClose}
        className="p-2 rounded-lg hover:bg-[#222226] disabled:opacity-40"><X className="w-4 h-4" /></button>
    </div>
    <p id="account-dialog-description" className="text-xs text-zinc-400 mb-4">
      {creating ? "Uses your existing recovery phrase. Each account has separate addresses and funds. Enter your wallet password to save it securely."
        : "Switching accounts cancels pending approvals. Connected websites will need your permission to reconnect."}
    </p>
    {error && <p role="alert" className="text-xs text-red-400 mb-3 break-words">{error}</p>}
    {creating ? <form onSubmit={event => { event.preventDefault(); void run(() => addAccount(password)); }} className="space-y-3">
      <label htmlFor="account-password" className="text-xs text-zinc-300 block">Wallet password</label>
      <input id="account-password" type="password" autoComplete="current-password" autoFocus required maxLength={1024}
        disabled={busy} value={password} onChange={event => setPassword(event.target.value)}
        className="w-full rounded-xl border border-[#27272A] bg-black p-3 text-sm focus:outline-none focus:border-[#E06341]" />
      <p className="text-[11px] text-zinc-400">Creating an account is free. Sending transactions from it requires its own testnet QOR for fees.</p>
      <button type="submit" disabled={busy || !password} className="w-full py-3 rounded-xl bg-[#E06341] text-xs font-semibold disabled:opacity-50">
        {busy ? "Creating account…" : "Create account"}
      </button>
      <button type="button" disabled={busy} onClick={() => { setCreating(false); setPassword(""); setError(null); }}
        className="w-full py-2 text-xs text-zinc-300">Back to accounts</button>
    </form> : <div className="space-y-2">
      {accounts.map(account => <button key={account.index} type="button" disabled={busy}
        aria-pressed={account.address === activeAddress}
        onClick={() => account.address === activeAddress ? onClose() : void run(() => switchAccount(account.index))}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#27272A] bg-black px-3 py-3 text-left hover:border-[#E06341] disabled:opacity-50">
        <span className="min-w-0"><span className="block text-xs font-semibold">{account.name}</span>
          <span className="block mt-1 text-[10px] font-mono text-zinc-400 break-all">{account.address}</span></span>
        {account.address === activeAddress && <Check className="w-4 h-4 shrink-0 text-[#E06341]" aria-label="Selected" />}
      </button>)}
      <button type="button" disabled={busy || accounts.length >= 100} onClick={() => { setCreating(true); setError(null); }}
        className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-[#E06341] text-xs font-semibold disabled:opacity-50">
        <Plus className="w-4 h-4" /> Add account
      </button>
      {busy && <p role="status" className="text-xs text-zinc-400">Switching account…</p>}
      <p className="text-[10px] text-zinc-500">Restore these accounts with the same recovery phrase, then add them again in order. Up to 100 accounts.</p>
    </div>}
  </dialog>;
}

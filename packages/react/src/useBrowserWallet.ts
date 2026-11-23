import { useCallback, useEffect, useRef, useState } from 'react';
import { getAddress } from 'ethers';
import { connectExtension, findZeni } from './connectExtension.js';

type Listener = (...values: unknown[]) => void;
export interface BrowserProvider {
  isZeni?: boolean;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, listener: Listener) => void;
  removeListener?: (event: string, listener: Listener) => void;
}
function zeniProvider(value: unknown): value is BrowserProvider {
  return !!value && typeof value === 'object' && (value as BrowserProvider).isZeni === true && typeof (value as BrowserProvider).request === 'function';
}
function firstAccount(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (typeof value[0] !== 'string') throw new Error('Zeni returned an invalid account.');
  return getAddress(value[0]);
}
function isDiana(value: unknown): boolean {
  try { return typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value) && BigInt(value) === 9800n; }
  catch { return false; }
}

export function useBrowserWallet() {
  const provider = useRef<BrowserProvider | null>(null);
  const operation = useRef(0);
  const pending = useRef(false);
  const [detected, setDetected] = useState(false);
  const [active, setActive] = useState<BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detect = useCallback(() => {
    const injected = (window as Window & { zeni?: unknown }).zeni;
    if (zeniProvider(injected)) { provider.current = injected; setDetected(true); }
    const announced = findZeni();
    if (announced) { provider.current = announced; setDetected(true); }
    return provider.current;
  }, []);
  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.info?.rdns === 'io.qorechain.zeni' && zeniProvider(detail.provider)) {
        provider.current = detail.provider; setDetected(true);
      }
    };
    window.addEventListener('eip6963:announceProvider', announce);
    window.addEventListener('focus', detect);
    detect();
    // Content-script injection may complete after the first discovery event.
    const timer = setTimeout(detect, 500);
    return () => {
      clearTimeout(timer); ++operation.current;
      window.removeEventListener('eip6963:announceProvider', announce);
      window.removeEventListener('focus', detect);
    };
  }, [detect]);

  const disconnect = useCallback(() => {
    ++operation.current; pending.current = false;
    setAccount(null); setActive(null); setConnecting(false); setError(null);
    // The current extension has no permission-revocation RPC. This only clears the local connection.
  }, []);

  async function connect() {
    if (pending.current) return;
    const wallet = detect();
    if (!wallet) { setError('Zeni extension not detected. Install it in this browser, then reload this page.'); return; }
    const version = ++operation.current;
    pending.current = true; setConnecting(true); setError(null);
    try {
      const { account } = await connectExtension(wallet);
      if (version !== operation.current) return;
      setAccount(getAddress(account)); setActive(wallet);
    } catch (failure) {
      if (version === operation.current) setError(failure instanceof Error ? failure.message : 'Could not connect to the Zeni extension.');
    } finally {
      if (version === operation.current) { pending.current = false; setConnecting(false); }
    }
  }

  useEffect(() => {
    if (!active) return;
    let disposed = false, checking = false;
    const version = operation.current;
    const current = () => !disposed && version === operation.current;
    const end = (message: string) => {
      if (!current()) return;
      ++operation.current; setAccount(null); setActive(null); setError(message);
    };
    const accountsChanged: Listener = value => {
      if (!current()) return;
      try {
        const address = firstAccount(value);
        if (address) setAccount(address);
        else end('Zeni is locked or disconnected. Unlock the extension and connect again.');
      } catch { end('Zeni returned an invalid account. Connect again.'); }
    };
    const chainChanged: Listener = value => { if (!isDiana(value)) end('The wallet network changed. Connect on Diana testnet again.'); };
    const disconnected: Listener = () => end('The Zeni extension disconnected.');
    const check = async () => {
      if (checking || document.hidden || !current()) return;
      checking = true;
      try {
        const [accounts, chain] = await Promise.all([active.request({ method: 'eth_accounts' }), active.request({ method: 'eth_chainId' })]);
        if (!current()) return;
        if (!isDiana(chain)) chainChanged(chain); else accountsChanged(accounts);
      } catch { end('The Zeni extension is unavailable. Connect again.'); }
      finally { checking = false; }
    };
    active.on?.('accountsChanged', accountsChanged);
    active.on?.('chainChanged', chainChanged);
    active.on?.('disconnect', disconnected);
    const timer = setInterval(() => void check(), 5000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      disposed = true; clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      active.removeListener?.('accountsChanged', accountsChanged);
      active.removeListener?.('chainChanged', chainChanged);
      active.removeListener?.('disconnect', disconnected);
    };
  }, [active]);
  return { account, detected, connecting, error, connect, disconnect, detect, provider: active };
}

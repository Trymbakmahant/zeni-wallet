import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { ZeniProvider, type ZeniProviderOptions } from '@zeni/connect';
export { ZeniProvider, ZeniError, CHAIN_ID } from '@zeni/connect';
interface ConnectState {
  provider: ZeniProvider; account: string | null; uri: string | null; connecting: boolean; error: string | null;
  connect: () => Promise<void>; disconnect: () => Promise<void>;
}
const Context = createContext<ConnectState | null>(null);
export function ZeniConnectProvider({ children, relayUrl, name }: ZeniProviderOptions & { children: ReactNode }) {
  const provider = useMemo(() => new ZeniProvider({ relayUrl, name }), [relayUrl, name]);
  const [account, setAccount] = useState<string | null>(null), [uri, setURI] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const display = (value: string) => setURI(value);
    const accounts = (values: string[]) => { setAccount(values[0] || null); if (values.length) setURI(null); };
    const disconnected = () => { setURI(null); setAccount(null); setConnecting(false); };
    provider.on('display_uri', display).on('accountsChanged', accounts).on('disconnect', disconnected);
    return () => { provider.removeListener('display_uri', display).removeListener('accountsChanged', accounts).removeListener('disconnect', disconnected); void provider.disconnect(); };
  }, [provider]);
  const connect = async () => {
    setError(null); setConnecting(true);
    try { await provider.connect(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Connection failed'); setURI(null); }
    finally { setConnecting(false); }
  };
  const disconnect = async () => { setURI(null); setConnecting(false); await provider.disconnect(); };
  return <Context.Provider value={{ provider, account, uri, connecting, error, connect, disconnect }}>{children}</Context.Provider>;
}
export function useZeni(): ConnectState {
  const value = useContext(Context);
  if (!value) throw new Error('useZeni must be used inside ZeniConnectProvider');
  return value;
}
/** All QR rendering is local; the pairing secret never goes to an image/analytics service. */
export function ZeniConnectButton({ className }: { className?: string }) {
  const { account, connect, disconnect, uri, connecting, error } = useZeni();
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false; setImage(null);
    if (uri) void QRCode.toDataURL(uri, { width: 320, margin: 2, errorCorrectionLevel: 'M' }).then(value => { if (!cancelled) setImage(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [uri]);
  return <div className={className}>
    <button type="button" onClick={() => void (account ? disconnect() : connect())} disabled={connecting}>
      {account ? `Disconnect ${account.slice(0, 6)}…${account.slice(-4)}` : connecting ? 'Waiting for Zeni…' : 'Connect Zeni Wallet'}
    </button>
    {account && <p><a href="zeni://request">Open Zeni to approve requests</a></p>}
    {uri && <div role="dialog" aria-modal="false" aria-label="Connect your Zeni mobile wallet" style={{ background: '#fff', color: '#171717', padding: 24, border: '1px solid #ddd', borderRadius: 16, maxWidth: 360 }}>
      <h2>Connect with Zeni</h2>
      <p>In Zeni, open Connect and scan this QR code. Check the website address before approving.</p>
      {image && <img src={image} width={280} height={280} alt="Scan with the Zeni wallet to connect" style={{ maxWidth: '100%', height: 'auto' }} />}
      <p><a href={uri} referrerPolicy="no-referrer">Open Zeni on this device</a></p>
      <button type="button" onClick={() => void disconnect()}>Cancel connection</button>
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

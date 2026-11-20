import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { ZeniConnectProvider, useZeni } from '@zeni-wallet/react';
import { Tabs, TabsList, TabsTab, TabsPanel } from '@ui-sdk/react/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@ui-sdk/react/dialog';
import { ArrowUpRight, ArrowRight, CheckCheck, ChevronRight, Copy, ExternalLink, Fingerprint, LoaderCircle, LockKeyhole, LogOut, QrCode, Monitor, ArrowLeft, ShieldCheck, Smartphone, X, AlertCircle, Signature } from 'lucide-react';
import { getAddress, hexlify, toUtf8Bytes, parseEther, toQuantity, verifyMessage } from 'ethers';
import { bech32 } from '@scure/base';
import QRCode from 'qrcode';
import { useBrowserWallet } from './useBrowserWallet';
import { TransactionExplorerLink } from './TransactionExplorerLink';
import './style.css';

const DOCS = 'https://github.com/Trymbakmahant/zeni-wallet/blob/main/docs/ZENI_CONNECT.md';
const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
type Outcome = { state: 'pending' | 'success' | 'error'; kind: 'message' | 'transfer'; title: string; description: string; value?: string };

function Coin({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true"><circle cx="50" cy="50" r="43" stroke="currentColor" strokeWidth="4" /><path d="M40 40h20v20H40z" stroke="currentColor" strokeWidth="3" /></svg>;
}
function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [status, setStatus] = useState('');
  useEffect(() => { if (!status) return; const timer = setTimeout(() => setStatus(''), 2000); return () => clearTimeout(timer); }, [status]);
  return <button type="button" className="copy-button" onClick={async () => { try { await navigator.clipboard.writeText(value); setStatus('Copied'); } catch { setStatus('Select to copy'); } }} aria-label={label}><Copy size={14} /><span aria-live="polite">{status || label}</span></button>;
}
function recipientError(input: string): string | undefined {
  try {
    const value = input.trim();
    let address: string;
    if (value.toLowerCase().startsWith('qor1')) {
      const decoded = bech32.decode(value as `${string}1${string}`);
      if (decoded.prefix !== 'qor') throw new Error();
      address = getAddress(hexlify(bech32.fromWords(decoded.words)));
    } else { address = getAddress(value); }
    if (address === '0x0000000000000000000000000000000000000000') return 'Use a wallet address other than the zero address.';
  } catch { return 'Enter a valid qor1… or 0x… wallet address.'; }
}
function Demo() {
  const { provider, account: mobileAccount, uri, connecting, error, connect, disconnect: disconnectMobile } = useZeni();
  const browser = useBrowserWallet();
  const account = browser.account || mobileAccount;
  const canSign = !!account;
  const [method, setMethod] = useState<'choice' | 'mobile' | 'extension'>('choice');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [qr, setQR] = useState<string | null>(null), [qrError, setQRError] = useState(false);
  const [recipient, setRecipient] = useState(''), [amount, setAmount] = useState('0.001');
  const [message, setMessage] = useState('Hello from Zeni Connect');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const messageBytes = new TextEncoder().encode(message).length;
  const connectionError = cancelled ? null : method === 'extension' ? browser.error : method === 'mobile' ? error : null;

  useEffect(() => { if (account) setDialogOpen(false); }, [account]);
  useEffect(() => {
    let disposed = false;
    setQR(null); setQRError(false);
    if (uri) void QRCode.toDataURL(uri, { width: 560, margin: 2, errorCorrectionLevel: 'M' })
      .then(image => { if (!disposed) setQR(image); }).catch(() => { if (!disposed) setQRError(true); });
    return () => { disposed = true; };
  }, [uri]);
  function startConnection() {
    setCancelled(false); setMethod('choice'); setDialogOpen(true); browser.detect();
  }
  function startMobile() {
    if (inFlight.current) return;
    browser.disconnect(); setOutcome(null); setMethod('mobile'); setCancelled(false); setDialogOpen(true);
    if (!connecting && !uri) void connect();
  }
  function startExtension() {
    setOutcome(null); setMethod('extension'); setCancelled(false);
    void browser.connect();
  }
  function disconnect() {
    browser.disconnect(); void disconnectMobile(); setOutcome(null);
  }
  function backToChoice() {
    disconnect(); setCancelled(true); setMethod('choice');
  }
  function changeDialog(open: boolean) {
    setDialogOpen(open);
    if (!open && !account) { setCancelled(true); disconnect(); }
  }
  async function request(kind: Outcome['kind']) {
    if (!account || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    const signer = account;
    const signingProvider = browser.account ? browser.provider! : provider;
    try {
      if (kind === 'message') {
        if (!messageBytes || messageBytes > 4096) throw new Error('Use a message between 1 and 4,096 UTF-8 bytes.');
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(message)) throw new Error('Remove hidden control characters from your message.');
      } else {
        const invalid = recipientError(recipient);
        if (invalid) throw new Error(invalid);
        if (!/^\d+(?:\.\d{1,6})?$/.test(amount.trim()) || parseEther(amount.trim()) <= 0n || parseEther(amount.trim()) >= 2n ** 256n) throw new Error('Enter a positive QOR amount with up to 6 decimal places.');
      }
      setOutcome({ state: 'pending', kind, title: 'Waiting for approval.', description: browser.account ? 'Open the Zeni extension from your browser toolbar and review the request.' : 'Open Zeni and review the request. Approve only when the details look right.' });
      if (kind === 'message') {
        const signature = await signingProvider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(message)), signer] });
        if (typeof signature !== 'string' || verifyMessage(message, signature).toLowerCase() !== signer.toLowerCase()) throw new Error('Signature verification failed.');
        setOutcome({ state: 'success', kind, title: 'Signature verified.', description: `Verified signature from ${signer}`, value: signature });
      } else {
        const hash = await signingProvider.request({ method: 'zeni_sendQor', params: [{ from: signer, to: recipient.trim(), value: toQuantity(parseEther(amount.trim())), chainId: '0x2648' }] });
        if (typeof hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hash)) throw new Error('The wallet returned an invalid transaction hash. Check Activity before retrying.');
        setOutcome({ state: 'success', kind, title: 'Native transfer completed.', description: 'Zeni returned a native transaction ID. View the receipt for confirmation and hybrid PQC signing details.', value: hash });
      }
    } catch (failure) {
      setOutcome({ state: 'error', kind, title: 'Request not completed.', description: failure instanceof Error ? failure.message : 'Something went wrong. Try connecting again.' });
    } finally { inFlight.current = false; setBusy(false); }
  }
  const submit = (kind: Outcome['kind']) => (event: FormEvent) => { event.preventDefault(); void request(kind); };

  return <Dialog open={dialogOpen} onOpenChange={changeDialog}>
    <a className="skip-link" href="#playground">Skip to playground</a>
    <header className="site-header">
      <a href="/" className="brand" aria-label="Zeni Connect home"><Coin />ZENI<span>/</span><span className="brand-product">Connect</span></a>
      <a href={DOCS} target="_blank" rel="noreferrer" className="header-docs">Docs<ArrowUpRight size={14} /></a>
    </header>
    <main className="page-shell">
      <section className="intro">
        <span className="network-pill"><span />Diana testnet · 9800</span>
        <h1>Try Zeni Connect.</h1>
        <p>Connect Zeni in your browser or on your phone.</p>
      </section>
      <section className="playground" id="playground" aria-label="Wallet connection playground">
        <div className="wallet-bar" id="wallet-card">
          <div className="wallet-heading"><span className={account ? 'status-dot connected' : 'status-dot'} /><div><h2>{account ? 'Wallet connected' : 'Connect your wallet'}</h2><p>{browser.account ? 'Browser extension · review requests in Zeni.' : account ? 'Mobile wallet · approve requests in Zeni.' : 'Choose the browser extension or mobile app.'}</p></div></div>
          {!account && <button className="button button-orange wallet-connect" onClick={startConnection} disabled={connecting || browser.connecting} aria-haspopup="dialog">{connecting ? <><LoaderCircle className="spin" size={16} />Waiting for Zeni…</> : <><QrCode size={16} />Connect Zeni Wallet</>}</button>}
          {account && <div className="account-box"><code title={account}>{shortAddress(account)}</code><CopyButton value={account} label="Copy address" />{!browser.account && <a href="zeni://request" className="account-open"><Smartphone size={14} />Open Zeni<ArrowUpRight size={12} /></a>}<button className="disconnect-button" onClick={() => void disconnect()} disabled={busy} aria-label={`Disconnect ${shortAddress(account)}`}><LogOut size={13} />Disconnect</button></div>}
          {browser.account && <div className="extension-note"><p>Open Zeni from your browser toolbar to review and approve requests.</p><button className="switch-mobile" disabled={busy} onClick={startMobile}><Smartphone size={14} />Use mobile wallet<ArrowRight size={14} /></button><small>Disconnect clears this demo’s connection, not the extension’s site permission.</small></div>}
          {connectionError && !dialogOpen && <p role="alert" className="connection-error">{connectionError}</p>}
        </div>
        <div className="request-workspace">
          <Tabs defaultValue="message" className="request-tabs"><TabsList aria-label="Wallet actions"><TabsTab value="message"><Signature size={16} />Sign a message</TabsTab><TabsTab value="transfer"><ArrowUpRight size={16} />Send QOR</TabsTab></TabsList>
            <TabsPanel value="message"><form onSubmit={submit('message')}><div className="request-heading"><p>Sign a message and verify it against your wallet address. No network fee.</p></div><div className="field-heading"><label htmlFor="message">Your message</label><span>UTF-8</span></div><textarea id="message" value={message} onChange={event => setMessage(event.target.value)} disabled={busy} spellCheck={false} aria-describedby="message-help" /><div className="field-helper" id="message-help"><span>This demo verifies the signature against your connected account.</span><span className={messageBytes > 4096 ? 'text-error' : ''}>{messageBytes.toLocaleString()} / 4,096 bytes</span></div><button className="button button-dark request-button" disabled={!canSign || busy || !messageBytes || messageBytes > 4096} type="submit">{busy && outcome?.kind === 'message' ? <><LoaderCircle className="spin" size={16} />Waiting for approval</> : <><Signature size={16} />Request signature<ArrowRight size={16} /></>}</button><p className="action-caption">{account ? <><ShieldCheck size={13} />You’ll review the full message in Zeni.</> : <><LockKeyhole size={13} />Connect your wallet to request a signature.</>}</p></form></TabsPanel>
            <TabsPanel value="transfer"><form onSubmit={submit('transfer')}><div className="request-heading"><p>Send testnet QOR. Review the recipient, amount, and fees in Zeni.</p></div><div className="field-heading"><label htmlFor="recipient">Recipient address</label><span>QORECHAIN</span></div><input id="recipient" value={recipient} onChange={event => setRecipient(event.target.value)} disabled={busy} placeholder="qor1… or 0x…" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="recipient-help" /><p className="input-helper" id="recipient-help">Use a QoreChain or EVM wallet address on Diana testnet.</p><div className="field-heading amount-label"><label htmlFor="amount">Amount</label><span>TESTNET TOKENS</span></div><div className="amount-input"><input id="amount" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} inputMode="decimal" autoComplete="off" aria-describedby="amount-help" /><span><Coin />QOR</span></div><p className="input-helper" id="amount-help">Hybrid PQC signing · up to 6 decimal places. Review network and setup fees in Zeni.</p><button className="button button-dark request-button" disabled={!canSign || busy || !recipient.trim() || !amount.trim()} type="submit">{busy && outcome?.kind === 'transfer' ? <><LoaderCircle className="spin" size={16} />Waiting for approval</> : <><Smartphone size={16} />Review transfer in Zeni<ArrowRight size={16} /></>}</button><p className="action-caption">{account ? <><ShieldCheck size={13} />Only approve if the recipient and amount match.</> : <><LockKeyhole size={13} />Connect your wallet to send testnet QOR.</>}</p></form></TabsPanel>
          </Tabs>
          <output className={outcome ? `result-panel result-${outcome.state}` : 'result-panel result-idle'} aria-live="polite" aria-atomic="true">{outcome ? <><div className="result-icon">{outcome.state === 'pending' ? <LoaderCircle className="spin" size={19} /> : outcome.state === 'success' ? <CheckCheck size={19} /> : <AlertCircle size={19} />}</div><div className="result-content"><strong>{outcome.title}</strong><p>{outcome.description}</p>{outcome.state === 'pending' && !browser.account && <a href="zeni://request">Open Zeni to approve requests<ArrowUpRight size={13} /></a>}{outcome.state === 'error' && outcome.kind === 'transfer' && <p>Check wallet Activity before retrying a transfer that timed out.</p>}{outcome.value && <><details><summary>{outcome.kind === 'message' ? 'View signature' : 'Transaction hash'}<ChevronRight size={13} /></summary><code>{outcome.value}</code><CopyButton value={outcome.value} label={outcome.kind === 'message' ? 'Copy signature' : 'Copy hash'} /></details>{outcome.kind === 'transfer' && <TransactionExplorerLink hash={outcome.value} />}</>}</div></> : <><span className="result-icon"><Fingerprint size={20} /></span><div><strong>A request starts here. Approval happens in Zeni.</strong><p>Your result will appear here after you respond on your phone.</p></div></>}</output>
        </div>
      </section>
      <footer><span><LockKeyhole size={12} />Your keys stay in your wallet.</span><a href={DOCS} target="_blank" rel="noreferrer">Integrate Zeni<ArrowUpRight size={13} /></a></footer>
    </main>
    <DialogContent className="pairing-dialog">
      <div className="dialog-top"><DialogTitle>{method === 'extension' ? 'Zeni extension' : method === 'mobile' ? 'Scan with Zeni' : 'Connect with Zeni'}</DialogTitle><DialogClose aria-label="Close connection"><X size={18} /></DialogClose></div>
      <DialogDescription>{method === 'choice' ? 'Choose how you want to connect.' : method === 'mobile' ? 'Scan with the QR scanner in your Zeni app.' : 'Approve this website in your browser wallet.'}</DialogDescription>
      {method === 'choice' && <div className="connection-options">
        <button className="connect-option extension-option" onClick={startExtension}><Monitor size={22} /><span><strong>Browser extension</strong><small>{browser.detected ? 'Zeni detected · sign and send' : 'Connect using the Zeni extension'}</small></span><ChevronRight size={16} /></button>
        <button className="connect-option mobile-option" onClick={startMobile}><QrCode size={22} /><span><strong>Mobile wallet</strong><small>Scan a QR code · sign and send</small></span><ChevronRight size={16} /></button>
      </div>}
      {method === 'mobile' && <><div className="qr-stage">{qr ? <img src={qr} alt="Scan with Zeni to connect your wallet" width={240} height={240} /> : <div className="qr-placeholder">{connectionError || qrError ? <AlertCircle size={28} /> : <LoaderCircle className="spin" size={28} />}<span>{connectionError ? 'Connection unavailable' : qrError ? 'QR could not be rendered' : 'Creating your connection…'}</span></div>}</div>{connectionError && <p role="alert" className="dialog-error">{connectionError}</p>}{qrError && <p role="alert" className="dialog-error">Use the link below to open Zeni on this device, or cancel and try again.</p>}{uri && <><span className="scan-status"><span />Waiting for your wallet</span><a href={uri} referrerPolicy="no-referrer" className="button button-dark"><Smartphone size={16} />Open Zeni on this device<ArrowUpRight size={15} /></a></>}{!connecting && !uri && <button className="button button-dark" onClick={startMobile}>Try again<ArrowRight size={15} /></button>}</>}
      {method === 'extension' && <div className="extension-status">
        {browser.connecting ? <><LoaderCircle className="spin" size={28} /><p role="status">Open Zeni and approve the connection.</p><small>If you cancel here, dismiss any open approval in Zeni too.</small></> : <><Monitor size={28} />{browser.error && <p role="alert" className="dialog-error">{browser.error}</p>}<button className="button button-dark retry-extension" onClick={startExtension}>Try again<ArrowRight size={15} /></button><button className="switch-mobile" disabled={busy} onClick={startMobile}>Connect with mobile instead<ArrowRight size={14} /></button></>}
      </div>}
      {method === 'mobile' && <div className="pairing-bottom"><LockKeyhole size={13} /><span>Check the website address in Zeni before approving.</span></div>}
      {method !== 'choice' && <button className="back-choice" onClick={backToChoice}><ArrowLeft size={13} />Connection options</button>}
      <DialogClose className="cancel-pairing">Cancel connection</DialogClose>
    </DialogContent>
  </Dialog>;
}
createRoot(document.getElementById('root')!).render(<ZeniConnectProvider relayUrl={import.meta.env.VITE_ZENI_RELAY_URL || (import.meta.env.PROD ? 'https://zeni-wallet.onrender.com' : 'http://localhost:8787')} name="Zeni Connect Demo"><Demo /></ZeniConnectProvider>);

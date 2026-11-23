import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { ZeniConnectProvider, useBrowserWallet, useZeni } from '@zeni-wallet/react';
import { Tabs, TabsList, TabsTab, TabsPanel } from '@ui-sdk/react/tabs';
import { ArrowRight, ArrowUpRight, Check, Code2, LoaderCircle, LogOut, Monitor, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { hexlify, parseEther, toQuantity, toUtf8Bytes, verifyMessage } from 'ethers';
import { transactionExplorerUrl, validateDappRequest } from '@zeni/core';
import QRCode from 'qrcode';
import { CodeBlock } from './CodeBlock';
import { reactExample, ZENI_RELAY } from './content';
import rainbowSource from './WalletPicker.tsx?raw';
import wagmiExample from './ConnectWithZeni.tsx?raw';
import extensionSource from '../../../../packages/react/src/connectExtension.ts?raw';
import './playground.css';

const WalletPicker = lazy(() => import('./WalletPicker'));
const ConnectWithZeni = lazy(() => import('./ConnectWithZeni'));
const relayUrl = import.meta.env.VITE_ZENI_RELAY_URL || (import.meta.env.PROD ? ZENI_RELAY : 'http://localhost:8787');
type Action = 'message' | 'transfer';
type Request = { method: string; params: unknown[] };
type Result = { state: 'pending' | 'success' | 'error'; action: Action; message: string; value?: string };

function makeRequest(action: Action, account: string, message: string, recipient: string, amount: string): Request {
  if (action === 'message') return { method: 'personal_sign', params: [hexlify(toUtf8Bytes(message)), account] };
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount.trim()) || parseEther(amount.trim()) <= 0n || parseEther(amount.trim()) >= 2n ** 256n) {
    throw new Error('Enter a positive QOR amount with up to 6 decimal places.');
  }
  return { method: 'zeni_sendQor', params: [{ from: account, to: recipient.trim(), value: toQuantity(parseEther(amount.trim())), chainId: '0x2648' }] };
}
function requestCode(request: Request, message: string): string {
  const verify = request.method === 'personal_sign';
  return `${verify ? "import { verifyMessage } from 'ethers';\n\n" : ''}// provider: the connected mobile or extension provider.\n// These are the exact parameters sent by this playground.\nconst request = ${JSON.stringify(request, null, 2)};\n\nconst ${verify ? 'signature' : 'hash'} = await provider.request(request);\n${verify ? `\nconst signer = verifyMessage(${JSON.stringify(message)}, signature);\nif (signer.toLowerCase() !== request.params[1].toLowerCase()) {\n  throw new Error('Signature verification failed.');\n}` : `\n// Native transaction ID: 64 hex characters, no 0x prefix.\n// Check wallet Activity before retrying a failed request.\nconst receipt = \`https://explore.qore.network/tx/\${hash}\`;`}`;
}

const guides = {
  rainbow: {
    title: 'RainbowKit', caption: 'Multi-wallet picker', file: 'WalletPicker.tsx', code: rainbowSource.trim(),
    setup: 'npm install @rainbow-me/rainbowkit@2 wagmi@2 viem@2 @tanstack/react-query@5 @qorechain/evm @qorechain/qorex-rainbowkit',
    prompt: 'Add a RainbowKit v2 Connect Wallet button to my React app for QoreChain Diana (9800). Reuse existing wagmi and React Query providers when present. Recommend QoreX and Browser Wallet and keep EIP-6963 discovery enabled so installed wallets, including Zeni, appear automatically. Import the RainbowKit stylesheet and use the wide modal. Connecting must not request a signature or transaction.',
  },
  wagmi: {
    title: 'wagmi', caption: 'Named Zeni button', file: 'ConnectWithZeni.tsx', code: wagmiExample,
    setup: 'Requires an existing wagmi v2 app configured for Diana (9800).',
    prompt: 'Add a Connect with Zeni button alongside my existing wagmi v2 wallet picker. Select the discovered connector with ID io.qorechain.zeni and connect to chain 9800 only on click. Handle missing wallets, pending approval and rejection. Preserve other connectors and never fall back to window.ethereum.',
  },
  extension: {
    title: 'Browser API', caption: 'Direct extension', file: 'connectExtension.ts',
    code: `${extensionSource.trim()}\n\n// In your Connect button's async click handler:\n// const { account, provider } = await connectExtension();`,
    setup: 'npm install --save-dev ethers@6  # TypeScript type only',
    prompt: 'Connect my app to Zeni without a wallet UI library. Discover io.qorechain.zeni via EIP-6963 without prompting. On click request eth_requestAccounts, validate the address and verify eth_chainId is 9800. Handle missing extensions, rejection and wrong networks. Never request a recovery phrase.',
  },
  mobile: {
    title: 'Mobile QR', caption: 'Zeni mobile SDK', file: 'MobileConnect.tsx', code: reactExample,
    setup: 'npm install @zeni-wallet/react',
    prompt: 'Add mobile QR pairing to my React app using ZeniConnectProvider and ZeniConnectButton. Configure my app name and a relay that allows my site origin. Use useZeni to display the approved account. Support cancellation and mobile deep links. Generate QR images locally; never expose pairing URIs to logs, analytics or a third-party image service.',
  },
} as const;
type Guide = keyof typeof guides;

export function ConnectPlayground() {
  return <ZeniConnectProvider relayUrl={relayUrl} name="Zeni Docs Playground"><Playground /></ZeniConnectProvider>;
}
function Playground() {
  const mobile = useZeni();
  const extension = useBrowserWallet();
  const [action, setAction] = useState<Action>('message');
  const [codeMode, setCodeMode] = useState<'connect' | 'request'>('connect');
  const [guide, setGuide] = useState<Guide>('rainbow');
  const method = guide === 'mobile' ? 'mobile' : 'extension';
  const account = method === 'mobile' ? mobile.account : extension.account;
  const direct = guide === 'mobile' || guide === 'extension';
  const [message, setMessage] = useState('Hello from Zeni Docs');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0.001');
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const inFlight = useRef(false);
  const currentAccount = useRef(account);
  currentAccount.current = account;
  const busy = result?.state === 'pending';
  const connecting = mobile.connecting || extension.connecting;
  const bytes = new TextEncoder().encode(message).length;
  const error = cancelled ? null : method === 'mobile' ? mobile.error : extension.error;
  useEffect(() => {
    let disposed = false;
    setQr(null); setQrError(false);
    if (mobile.uri) void QRCode.toDataURL(mobile.uri, { width: 440, margin: 2, errorCorrectionLevel: 'M' })
      .then(value => { if (!disposed) setQr(value); }).catch(() => { if (!disposed) setQrError(true); });
    return () => { disposed = true; };
  }, [mobile.uri]);

  let draftCode: string;
  try { draftCode = requestCode(makeRequest(action, account || 'YOUR_CONNECTED_ACCOUNT', message, recipient, amount), message); }
  catch { draftCode = '// Enter a positive amount with up to 6 decimals\n// to preview the native QOR request.'; }
  function showGuide(next: Guide) { setGuide(next); setCodeMode('connect'); setResult(null); setLastCode(null); }
  function edit() { setLastCode(null); setResult(null); setCodeMode('request'); }
  function choose(value: Action | null) { if (busy || !value) return; setAction(value); edit(); }
  function start(mode: 'mobile' | 'extension') {
    if (inFlight.current || connecting || account) return;
    setCancelled(false); showGuide(mode);
    if (mode === 'mobile') void mobile.connect(); else void extension.connect();
  }
  function disconnect() {
    if (inFlight.current) return;
    setCancelled(true); if (method === 'mobile') void mobile.disconnect(); else extension.disconnect();
    setResult(null); setLastCode(null); setCodeMode('connect');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account || inFlight.current) return;
    inFlight.current = true;
    try {
      const request = makeRequest(action, account, message, recipient, amount);
      validateDappRequest(request.method, request.params, account);
      setLastCode(requestCode(request, message)); setCodeMode('request');
      setResult({ state: 'pending', action, message: method === 'extension' ? 'Open Zeni from your browser toolbar and review the request.' : 'Review and approve this request in your Zeni mobile app.' });
      const provider = method === 'extension' ? extension.provider! : mobile.provider;
      const value = await provider.request(request);
      if (currentAccount.current !== account) throw new Error('The connected account changed while approving. Check wallet Activity before retrying a transfer.');
      if (typeof value !== 'string') throw new Error('Unexpected wallet response. Check Activity before retrying.');
      if (action === 'message') {
        if (verifyMessage(message, value).toLowerCase() !== account.toLowerCase()) throw new Error('Signature verification failed.');
        setResult({ state: 'success', action, message: 'Signature verified against your connected account.', value });
      } else {
        if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid native transaction ID. Check Activity before retrying.');
        setResult({ state: 'success', action, message: 'Native transfer confirmed. Open the receipt for the transaction details.', value });
      }
    } catch (failure) {
      setResult({ state: 'error', action, message: failure instanceof Error ? failure.message : 'Request failed.' });
    } finally { inFlight.current = false; }
  }
  return <div className="connect-playground">
    <div className="pg-toolbar"><span><span className="docs-status-dot" />LIVE PLAYGROUND</span><span>Diana testnet · 9800</span></div>
    <div className="pg-grid">
      <div className="pg-controls">
        <div className="pg-step"><h3>Choose an integration</h3></div>
        <div className="pg-connection-options pg-guides" role="group" aria-label="Implementation guides">
          {(Object.keys(guides) as Guide[]).map(key => <button type="button" key={key} disabled={busy || connecting} aria-pressed={guide === key} aria-controls="pg-implementation" onClick={() => showGuide(key)}>
            <strong>{guides[key].title}</strong><small>{guides[key].caption}</small>
          </button>)}
        </div>
        {!direct ? <div className={guide === 'rainbow' ? 'pg-rainbow' : 'pg-named-wallet'}>
          <Suspense fallback={<span>Loading wallet connection...</span>}>
            <WalletPicker>{guide === 'wagmi' ? <ConnectWithZeni /> : undefined}</WalletPicker>
          </Suspense>
        </div> : <>
        <div className="pg-step"><span>01</span><h3>Connect to the Zeni playground</h3></div>
        {account ? <div className="pg-account"><span><Check size={14} />{method === 'extension' ? 'Browser extension' : 'Mobile wallet'} connected</span><code>{account}</code><button type="button" className="pg-text-button pg-disconnect" disabled={busy} onClick={disconnect}><LogOut size={13} />Disconnect</button></div> : <>
          <div className="pg-connection-options">
            {guide === 'extension' ? <button type="button" className="pg-extension" disabled={!extension.detected || connecting || busy} onClick={() => start('extension')}>
              <Monitor size={19} /><strong>{extension.connecting ? 'Waiting for wallet...' : 'Connect with Zeni'}</strong><small>Browser extension</small>
            </button> :
            <button type="button" className="pg-mobile" disabled={connecting || busy} onClick={() => start('mobile')}><QrCode size={19} /><strong>Connect mobile wallet</strong><small>Scan a QR code</small></button>}
          </div>
          {guide === 'extension' && !extension.detected && !connecting && <p className="pg-helper">Zeni extension not detected. Enable it and refresh, or choose Mobile QR.</p>}
        </>}
        {!account && connecting && <p role="status" className="pg-status"><LoaderCircle size={14} className="pg-spin" />{method === 'extension' ? 'Approve the connection in Zeni.' : 'Waiting for mobile approval…'}</p>}
        {!account && mobile.uri && <div className="pg-pairing">{qr ? <img src={qr} width={220} height={220} alt="Scan with Zeni to connect to the docs playground" /> : <p role="status">{qrError ? 'QR unavailable. Use the link below.' : 'Rendering QR…'}</p>}<p>Scan with Zeni. Check this website’s address before approving.</p><a href={mobile.uri} referrerPolicy="no-referrer"><Smartphone size={14} />Open Zeni on this device<ArrowUpRight size={13} /></a></div>}
        {!account && connecting && <button type="button" className="pg-text-button pg-cancel" onClick={disconnect}>Cancel connection</button>}
        {error && <p role="alert" className="pg-error">{error}{method === 'mobile' && /403/.test(error) && ' This site’s origin needs to be allowed by the relay. See Host a relay below.'}</p>}
        <div className="pg-step pg-request-step"><span>02</span><h3>Make a request</h3></div>
        <Tabs value={action} onValueChange={choose} className="docs-tabs pg-tabs"><TabsList aria-label="Playground actions"><TabsTab value="message" disabled={busy}>Sign a message</TabsTab><TabsTab value="transfer" disabled={busy}>Send QOR</TabsTab></TabsList>
          <TabsPanel value="message"><form onSubmit={submit}><label htmlFor="pg-message">Message</label><textarea id="pg-message" value={message} onChange={e => { setMessage(e.target.value); edit(); }} disabled={busy} maxLength={4096} spellCheck={false} aria-describedby="pg-message-help" /><p id="pg-message-help" className="pg-helper">{bytes.toLocaleString()} / 4,096 UTF-8 bytes · No network fee.<br />EIP-191 message signatures use classical ECDSA.</p><button className="docs-button docs-button-primary pg-submit" disabled={!account || busy || bytes === 0 || bytes > 4096}>{busy ? 'Waiting for approval…' : 'Sign & verify message'}<ArrowRight size={14} /></button></form></TabsPanel>
          <TabsPanel value="transfer"><form onSubmit={submit}><label htmlFor="pg-recipient">Recipient</label><input id="pg-recipient" placeholder="qor1… or 0x…" value={recipient} onChange={e => { setRecipient(e.target.value); edit(); }} disabled={busy} autoComplete="off" spellCheck={false} /><div className="pg-field-heading"><label htmlFor="pg-amount">Amount in QOR</label><button type="button" className="pg-text-button" disabled={!account || busy} onClick={() => { setRecipient(account!); edit(); }}>Use my address</button></div><input id="pg-amount" value={amount} onChange={e => { setAmount(e.target.value); edit(); }} inputMode="decimal" disabled={busy} autoComplete="off" aria-describedby="pg-transfer-help" /><p id="pg-transfer-help" className="pg-helper">Real testnet transfer · Up to 6 decimal places.<br />QOR is required for network and any setup fees. Review all fees in Zeni before approving.</p><button className="docs-button docs-button-primary pg-submit" disabled={!account || busy || !recipient.trim() || !amount.trim()}>{busy ? 'Waiting for approval…' : 'Review transfer in Zeni'}<ArrowRight size={14} /></button></form></TabsPanel>
        </Tabs>
        {!account && <p className="pg-helper">Connect above to enable requests.</p>}
        {result && <div role="status" className={`pg-result pg-result-${result.state}`}><strong>{result.state === 'pending' ? 'Waiting for your approval' : result.state === 'success' ? 'Request completed' : 'Request not completed'}</strong><p>{result.message}</p>{result.action === 'transfer' && result.state === 'error' && <p>Check wallet Activity before retrying. A lost response does not mean a transfer was never sent.</p>}{result.state === 'pending' && method === 'mobile' && <a href="zeni://request">Open Zeni to approve<ArrowUpRight size={13} /></a>}{result.value && <details><summary>{result.action === 'message' ? 'View signature' : 'View transaction ID'}</summary><code>{result.value}</code></details>}{result.value && result.action === 'transfer' && <a href={transactionExplorerUrl(result.value)} target="_blank" rel="noreferrer">View receipt<ArrowUpRight size={13} /></a>}</div>}
        {account && method === 'extension' && <p className="pg-helper">Disconnect clears this page’s connection. Manage website permissions in Zeni.</p>}
        </>}
      </div>
      <div className="pg-code-panel" id="pg-implementation">
        <div className="pg-code-heading"><Code2 size={17} /><strong>{codeMode === 'connect' ? `Implement ${guides[guide].title}` : 'Inspect the wallet request'}</strong></div>
        {direct && <div className="pg-code-switch" aria-label="Code preview"><button type="button" aria-pressed={codeMode === 'connect'} onClick={() => setCodeMode('connect')}>Integration guide</button><button type="button" aria-pressed={codeMode === 'request'} onClick={() => setCodeMode('request')}>Wallet request</button></div>}
        {codeMode === 'connect' ? <div key={guide} className="pg-guide-content">
          <CodeBlock label="Setup" code={guides[guide].setup} />
          <CodeBlock label={guides[guide].file} code={guides[guide].code} />
          <CodeBlock label={`${guides[guide].title} AI prompt`} code={guides[guide].prompt} copyLabel="Copy prompt" />
        </div> : <><p>{lastCode ? 'The exact request from your last attempt.' : 'Parameters update as you type; connect before running.'}</p><CodeBlock code={lastCode || draftCode} label="Live wallet request · TypeScript" /></>}
        <div className="pg-code-note"><ShieldCheck size={15} /><span>Your private keys stay in Zeni. This page only receives the approved account, signature, or transaction ID.</span></div></div>
    </div>
  </div>;
}

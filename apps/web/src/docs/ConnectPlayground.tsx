import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ZeniConnectProvider, useBrowserWallet, useZeni } from '@zeni-wallet/react';
import { Tabs, TabsList, TabsTab, TabsPanel } from '@ui-sdk/react/tabs';
import { ArrowRight, ArrowUpRight, Check, Code2, LoaderCircle, LogOut, Monitor, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { hexlify, parseEther, toQuantity, toUtf8Bytes, verifyMessage } from 'ethers';
import { transactionExplorerUrl, validateDappRequest } from '@zeni/core';
import QRCode from 'qrcode';
import { CodeBlock } from './CodeBlock';
import { ZENI_RELAY } from './content';
import './playground.css';

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
function connectionCode(method: 'mobile' | 'extension'): string {
  return method === 'extension' ? `import { useBrowserWallet } from '@zeni-wallet/react';\n\n// Inside your React component. Discovers Zeni via\n// EIP-6963 / window.zeni, with no relay connection.\nconst wallet = useBrowserWallet();\n\nasync function connectExtension() {\n  await wallet.connect();\n}\n\n// wallet.account: the approved address\n// wallet.provider: use for signing requests\n// wallet.error: show connection failures\n// wallet.disconnect(): clear this app's connection` : `import { ZeniConnectProvider, useZeni } from '@zeni-wallet/react';\nimport QRCode from 'qrcode';\n\n// Wrap your playground in:\n<ZeniConnectProvider\n  name="Zeni Docs Playground"\n  relayUrl=${JSON.stringify(relayUrl)}\n>\n  <Playground />\n</ZeniConnectProvider>\n\n// Inside Playground:\nconst { connect, provider, account, uri } = useZeni();\n// On button click: await connect();\n// When uri changes, render locally:\n// await QRCode.toDataURL(uri);\n// Never log or send the pairing URI to an image service.`;
}

export function ConnectPlayground() {
  return <ZeniConnectProvider relayUrl={relayUrl} name="Zeni Docs Playground"><Playground /></ZeniConnectProvider>;
}
function Playground() {
  const mobile = useZeni();
  const extension = useBrowserWallet();
  const account = extension.account || mobile.account;
  const [method, setMethod] = useState<'mobile' | 'extension'>('extension');
  const [action, setAction] = useState<Action>('message');
  const [codeMode, setCodeMode] = useState<'connect' | 'request'>('connect');
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
  const displayedCode = codeMode === 'connect' ? connectionCode(method) : lastCode || draftCode;
  function edit() { setLastCode(null); setResult(null); setCodeMode('request'); }
  function choose(value: Action | null) { if (busy || !value) return; setAction(value); edit(); }
  function start(mode: 'mobile' | 'extension') {
    if (inFlight.current || connecting || account) return;
    setMethod(mode); setCancelled(false); setResult(null); setLastCode(null); setCodeMode('connect');
    if (mode === 'mobile') void mobile.connect(); else void extension.connect();
  }
  function disconnect() {
    if (inFlight.current) return;
    setCancelled(true); extension.disconnect(); void mobile.disconnect(); setResult(null); setLastCode(null); setCodeMode('connect');
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
      const provider = extension.account ? extension.provider! : mobile.provider;
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
        <div className="pg-step"><span>01</span><h3>Connect your wallet</h3></div>
        {account ? <div className="pg-account"><span><Check size={14} />{extension.account ? 'Browser extension' : 'Mobile wallet'} connected</span><code>{account}</code><button type="button" className="pg-text-button pg-disconnect" disabled={busy} onClick={disconnect}><LogOut size={13} />Disconnect</button></div> : <div className="pg-connection-options"><button type="button" className="pg-extension" disabled={connecting || busy} onClick={() => start('extension')}><Monitor size={19} /><strong>Browser extension</strong><small>{extension.detected ? 'Zeni detected' : 'Use your Zeni extension'}</small></button><button type="button" className="pg-mobile" disabled={connecting || busy} onClick={() => start('mobile')}><QrCode size={19} /><strong>Mobile wallet</strong><small>Scan a QR code</small></button></div>}
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
      </div>
      <div className="pg-code-panel"><div className="pg-code-heading"><Code2 size={17} /><strong>See what runs</strong></div><div className="pg-code-switch" aria-label="Code preview"><button type="button" aria-pressed={codeMode === 'connect'} onClick={() => setCodeMode('connect')}>Connection</button><button type="button" aria-pressed={codeMode === 'request'} onClick={() => setCodeMode('request')}>Wallet request</button></div><p>{codeMode === 'connect' ? 'The SDK connection used by this playground.' : lastCode ? 'The exact request from your last attempt.' : 'Request preview. Parameters update as you type; connect before running.'}</p><CodeBlock code={displayedCode} label={codeMode === 'connect' ? 'Connection · React' : 'Live wallet request · TypeScript'} /><div className="pg-code-note"><ShieldCheck size={15} /><span>Your private keys stay in Zeni. This page only receives the approved account, signature, or transaction ID.</span></div></div>
    </div>
  </div>;
}

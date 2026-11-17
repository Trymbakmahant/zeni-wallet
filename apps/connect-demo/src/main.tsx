import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ZeniConnectProvider, ZeniConnectButton, useZeni } from '@zeni/react';
import { hexlify, toUtf8Bytes, parseEther, toQuantity, verifyMessage } from 'ethers';
import './style.css';
function Demo() {
  const { provider, account } = useZeni();
  const [recipient, setRecipient] = useState(''), [amount, setAmount] = useState('0.001');
  const [message, setMessage] = useState('Hello from Zeni Connect'), [result, setResult] = useState(''), [busy, setBusy] = useState(false);
  async function run(action: () => Promise<string>) {
    setBusy(true); setResult('Review the request in your Zeni mobile wallet.');
    try { setResult(await action()); } catch (error) { setResult(error instanceof Error ? error.message : 'Request failed'); } finally { setBusy(false); }
  }
  return <main><p className="eyebrow">Zeni Connect · Diana testnet</p><h1>Your app. Your mobile wallet.</h1>
    <p>Connect Zeni, approve a message, or send QOR. Your wallet reviews and signs each request on your phone.</p>
    <ZeniConnectButton />
    <section><h2>Sign a message</h2><label>Message<textarea value={message} onChange={e => setMessage(e.target.value)} /></label>
      <button disabled={!account || busy} onClick={() => void run(async () => {
        const signature = await provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(message)), account] });
        if (verifyMessage(message, signature).toLowerCase() !== account!.toLowerCase()) throw new Error('Signature verification failed');
        return `Verified signature from ${account}: ${signature}`;
      })}>Request signature</button></section>
    <section><h2>Send testnet QOR</h2><label>Recipient<input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x…" /></label>
      <label>Amount<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" /></label>
      <button disabled={!account || busy} onClick={() => void run(async () => {
        const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: account, to: recipient, value: toQuantity(parseEther(amount)), chainId: '0x2648' }] });
        return `Submitted: ${hash}. Check the testnet explorer for confirmation.`;
      })}>Review transfer in Zeni</button></section>
    <output aria-live="polite">{result}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<ZeniConnectProvider relayUrl={import.meta.env.VITE_ZENI_RELAY_URL || 'http://localhost:8787'} name="Zeni Connect Demo"><Demo /></ZeniConnectProvider>);

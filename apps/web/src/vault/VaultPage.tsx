import { useEffect, useRef, useState } from 'react';
import { useBrowserWallet } from '@zeni-wallet/react';
import { Interface, formatEther, getAddress, parseEther, toQuantity } from 'ethers';
import { ArrowUpRight, LockKeyhole, Wallet, LoaderCircle } from 'lucide-react';
import artifact from './artifact.json';
import './vault.css';

const abi = new Interface(artifact.abi);
const KEY = 'zeni-vault-demo-v1';
type Action = 'deploy' | 'deposit' | 'withdraw';
type Transaction = { action: Action; account: string; hash?: string; status: 'review' | 'pending' | 'confirmed' | 'failed' | 'unknown' };
function readSaved(): { address: string; transaction: Transaction | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const address = typeof saved.address === 'string' && /^0x[\da-f]{40}$/i.test(saved.address) ? saved.address : '';
    const tx = saved.transaction;
    const valid = tx && ['deploy', 'deposit', 'withdraw'].includes(tx.action) && /^0x[\da-f]{40}$/i.test(tx.account)
      && ['review', 'pending', 'confirmed', 'failed', 'unknown'].includes(tx.status) && (!tx.hash || /^0x[\da-f]{64}$/i.test(tx.hash));
    return { address, transaction: valid ? { ...tx, status: tx.status === 'review' ? 'unknown' : tx.status } : null };
  } catch { return { address: '', transaction: null }; }
}

export function VaultPage() {
  const wallet = useBrowserWallet();
  const [saved] = useState(readSaved);
  const [address, setAddress] = useState(saved.address);
  const [verified, setVerified] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [transaction, setTransaction] = useState<Transaction | null>(saved.transaction);
  const [amount, setAmount] = useState('0.01');
  const [deposit, setDeposit] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [checkingReceipt, setCheckingReceipt] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const vaultReady = !!verified && verified.toLowerCase() === address.trim().toLowerCase();
  const pending = transaction?.status === 'pending' || transaction?.status === 'review' || transaction?.status === 'unknown';
  useEffect(() => {
    document.title = 'Zeni Vault Lab — Contract Transaction Demo';
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'Test Zeni contract transactions on QoreChain Diana: deploy a demo vault, deposit QOR, and withdraw through your extension.');
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ address, transaction })); } catch { /* Storage may be disabled. */ }
  }, [address, transaction]);
  useEffect(() => {
    ++generation.current;
    setVerified(''); setDeposit(null); setBalance(null);
    return () => { ++generation.current; };
  }, [wallet.account, wallet.provider]);
  useEffect(() => {
    setVerified(''); setDeposit(null); setVerificationError(''); setVerifying(false);
    if (!wallet.provider || !wallet.account || !address.trim()) return;
    const provider = wallet.provider;
    let disposed = false;
    let target: string;
    try { target = getAddress(address.trim()); }
    catch { setVerificationError('Enter a valid vault contract address in step 02.'); return; }
    setVerifying(true);
    void (async () => {
      try {
        const chain = await provider.request({ method: 'eth_chainId' });
        if (chain !== '0x2648') throw new Error('Connect to QoreChain Diana testnet (9800).');
        const code = await provider.request({ method: 'eth_getCode', params: [target, 'latest'] });
        if (disposed) return;
        if (String(code).toLowerCase() !== artifact.deployedBytecode.toLowerCase()) throw new Error('This address does not match the demo vault. Choose your deployed vault or deploy a new one in step 02.');
        setVerified(target);
      } catch (failure) {
        if (!disposed) setVerificationError(failure instanceof Error ? failure.message : 'Could not check this vault. Retry verification.');
      } finally { if (!disposed) setVerifying(false); }
    })();
    return () => { disposed = true; };
  }, [wallet.provider, wallet.account, address, verificationAttempt]);

  useEffect(() => {
    if (!wallet.provider || !wallet.account) return;
    let disposed = false;
    const provider = wallet.provider, account = wallet.account;
    setBalanceError('');
    void (async () => {
      const [walletResult, depositResult] = await Promise.allSettled([
        provider.request({ method: 'eth_getBalance', params: [account, 'latest'] }),
        verified ? provider.request({ method: 'eth_call', params: [{ to: verified, data: abi.encodeFunctionData('deposits', [account]) }, 'latest'] }) : Promise.resolve(null),
      ]);
      if (disposed) return;
      const failures: string[] = [];
      try {
        if (walletResult.status === 'rejected') throw walletResult.reason;
        setBalance(formatEther(BigInt(String(walletResult.value))));
      } catch { setBalance(null); failures.push('Could not read your wallet balance.'); }
      try {
        if (depositResult.status === 'rejected') throw depositResult.reason;
        setDeposit(depositResult.value ? formatEther(abi.decodeFunctionResult('deposits', String(depositResult.value))[0]) : null);
      } catch { setDeposit(null); failures.push('Could not read your vault deposit.'); }
      setBalanceError(failures.length ? `${failures.join(' ')} Refresh balances to retry.` : '');
    })();
    return () => { disposed = true; };
  }, [wallet.provider, wallet.account, verified, refresh]);

  useEffect(() => {
    if (!wallet.provider || transaction?.status !== 'pending' || !transaction.hash) return;
    const provider = wallet.provider, tx = transaction;
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 120_000;
    setCheckingReceipt(true);
    async function poll() {
      try {
        const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [tx.hash] }) as { transactionHash?: string; status?: string; blockNumber?: string; contractAddress?: string } | null;
        if (disposed) return;
        if (receipt?.transactionHash?.toLowerCase() === tx.hash!.toLowerCase() && receipt.blockNumber && ['0x0', '0x1'].includes(receipt.status || '')) {
          setTransaction({ ...tx, status: receipt.status === '0x1' ? 'confirmed' : 'failed' });
          setCheckingReceipt(false);
          if (receipt.status === '0x1' && tx.action === 'deploy' && receipt.contractAddress) {
            setAddress(getAddress(receipt.contractAddress)); setVerified('');
          }
          setRefresh(value => value + 1);
          return;
        }
      } catch { /* Retain pending state; an RPC failure is not a failed transaction. */ }
      if (disposed) return;
      if (Date.now() < deadline) timer = setTimeout(() => void poll(), 2000);
      else setCheckingReceipt(false);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [wallet.provider, transaction, refresh]);

  async function send(action: Action) {
    if (!wallet.provider || !wallet.account || operation.current || pending) return;
    operation.current = true; setBusy(true); setError('');
    const account = wallet.account, provider = wallet.provider;
    const current = generation.current;
    let requested = false;
    try {
      if (await provider.request({ method: 'eth_chainId' }) !== '0x2648') throw new Error('Connect to QoreChain Diana testnet (9800).');
      let value = 0n;
      if (action !== 'deploy') {
        if (!vaultReady) throw new Error('Verify your vault address first.');
        if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || parseEther(amount) <= 0n) throw new Error('Enter a positive QOR amount with up to six decimal places.');
        value = parseEther(amount);
        if (action === 'withdraw' && (deposit === null || value > parseEther(deposit))) throw new Error('Withdrawal exceeds your deposited balance. Refresh balances first.');
      }
      if (current !== generation.current) throw new Error('Wallet changed. Connect again.');
      const data = action === 'deploy' ? artifact.bytecode : abi.encodeFunctionData(action, action === 'withdraw' ? [value] : []);
      const record: Transaction = { action, account, status: 'review' };
      setTransaction(record);
      requested = true;
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{
        from: account, ...(action === 'deploy' ? {} : { to: verified }),
        value: toQuantity(action === 'deposit' ? value : 0n), data, chainId: '0x2648',
      }] });
      if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw new Error('The wallet returned an unexpected result. Check Activity before retrying.');
      setTransaction({ ...record, hash, status: 'pending' });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Wallet request failed.';
      const code = (failure as { code?: number })?.code;
      setError(message);
      if (requested) {
        const hash = message.match(/0x[\da-f]{64}\b/i)?.[0];
        const rejected = code === 4001 && !/timed out|expired/i.test(message);
        setTransaction({ action, account, ...(hash ? { hash } : {}), status: hash ? 'pending' : rejected || code === 4200 || code === 4100 || code === -32602 ? 'failed' : 'unknown' });
      }
    } finally { operation.current = false; setBusy(false); }
  }

  const actionHelp = !wallet.account ? 'Connect Zeni in step 01 to deposit QOR.'
    : transaction?.status === 'unknown' ? 'Check Transaction status below and resolve the previous request before depositing again.'
    : transaction?.status === 'review' ? 'Finish or reject the request in your Zeni approval window.'
    : transaction?.status === 'pending' ? 'Waiting for your previous transaction to confirm. Use Refresh balances & receipt to check again.'
    : !address.trim() ? 'Deploy a vault or enter its contract address in step 02 first.'
    : verifying ? 'Checking your vault contract…'
    : verificationError || (!vaultReady ? 'Checking your vault before enabling deposits…' : busy ? 'Waiting for your current action to finish…' : 'Ready to deposit. Zeni will open for your approval.');
  const actionsDisabled = !vaultReady || !wallet.account || busy || pending;

  return <div className="vault-page">
    <header className="vault-header"><a href="/" className="vault-brand"><span>Z</span> ZENI <small>VAULT LAB</small></a><a href="/docs#contract-transactions">Developer guide <ArrowUpRight size={15} /></a></header>
    <main className="vault-main">
      <div className="vault-eyebrow">QORECHAIN DIANA · TESTNET 9800</div>
      <h1>Your app. Your contract.<br /><span>Approved in Zeni.</span></h1>
      <p className="vault-lead">Deploy a simple vault, deposit testnet QOR, and withdraw it. Every transaction opens Zeni for your review and approval.</p>
      <div className="vault-notice">Use the unpacked Zeni <strong>v0.1.4</strong> build for this demo. The current store release does not support contract transactions. <a href="/downloads/zeni-wallet-extension-0.1.4.zip">Download test build</a></div>
      <div className="vault-grid">
        <section className="vault-card"><div className="vault-card-title"><Wallet size={20} /><h2>01 · Connect Zeni</h2></div>
          {wallet.account ? <><p className="vault-address">{wallet.account}</p><p className="vault-balance">{balance ?? '…'} <small>QOR available</small></p><button className="vault-secondary" disabled={busy} onClick={wallet.disconnect}>Disconnect</button></> : <><p>Install or reload the test build, then connect your wallet. Use a test account funded from the faucet.</p><button disabled={wallet.connecting} onClick={() => void wallet.connect()}>{wallet.connecting ? 'Approve connection in Zeni…' : 'Connect Zeni'}</button>{!wallet.detected && <p className="vault-helper">Zeni is not detected yet. Reload this page after installing the extension.</p>}</>}
          <a className="vault-faucet" href="https://dashboard.qorechain.io/faucet" target="_blank" rel="noreferrer">Get testnet QOR <ArrowUpRight size={14} /></a>
        </section>
        <section className="vault-card"><div className="vault-card-title"><LockKeyhole size={20} /><h2>02 · Choose your vault</h2></div><p>Deploy a fresh vault through Zeni, or enter an existing vault created with this demo. We check the contract automatically.</p>
          <button disabled={!wallet.account || busy || pending} onClick={() => void send('deploy')}>Deploy test vault</button>
          <label htmlFor="vault-address">Vault contract address</label><input id="vault-address" placeholder="0x…" value={address} disabled={busy || pending} onChange={e => { setAddress(e.target.value); setVerified(''); setDeposit(null); setVerificationError(''); }} />
          <button className="vault-secondary" disabled={!wallet.account || !address || busy || verifying} onClick={() => setVerificationAttempt(value => value + 1)}>{verifying ? 'Checking vault…' : 'Recheck vault'}</button>{verificationError && <p role="alert" className="vault-error">{verificationError}</p>}{vaultReady && <p className="vault-success">Contract bytecode matches the demo vault.</p>}
        </section>
        <section className="vault-card vault-actions"><div className="vault-card-title"><h2>03 · Deposit & withdraw</h2></div><div className="vault-deposited"><span>Your deposit</span><strong>{deposit ?? (vaultReady && !balanceError ? '…' : '—')} <small>QOR</small></strong></div>
          <p id="vault-action-help" role="status">{actionHelp}</p>
          {verificationError && <button className="vault-secondary" disabled={busy || verifying} onClick={() => setVerificationAttempt(value => value + 1)}>Retry vault check</button>}
          {balanceError && <p role="alert" className="vault-error">{balanceError}</p>}
          <label htmlFor="vault-amount">Amount in QOR</label><input id="vault-amount" inputMode="decimal" value={amount} disabled={busy || pending} onChange={e => setAmount(e.target.value)} />
          <div className="vault-action-buttons"><button aria-describedby="vault-action-help" disabled={actionsDisabled} onClick={() => void send('deposit')}>Deposit QOR</button><button className="vault-secondary" aria-describedby="vault-action-help" disabled={actionsDisabled || deposit === null} onClick={() => void send('withdraw')}>Withdraw QOR</button></div>
          <button className="vault-text-button" disabled={!wallet.account || busy} onClick={() => setRefresh(value => value + 1)}>Refresh balances & receipt</button>
          <p className="vault-helper">Your address can withdraw only its own deposit. This demo offers no yield and needs no token spending approval.</p>
        </section>
        <section className="vault-card vault-receipt" aria-live="polite"><div className="vault-card-title"><h2>Transaction status</h2>{(busy || checkingReceipt) && <LoaderCircle size={18} className="vault-spinner" />}</div>
          {transaction ? <><p className="vault-status">{transaction.action} · {transaction.status === 'review' ? 'Review in your extension' : transaction.status}</p><p className="vault-helper">Account: <span className="vault-address">{transaction.account}</span></p>{transaction.hash && <p className="vault-address">{transaction.hash}</p>}{transaction.status === 'confirmed' && <p className="vault-success">Confirmed on-chain.{transaction.action === 'deploy' ? ' Your new vault is checked automatically before deposits are enabled.' : ''}</p>}{transaction.status === 'pending' && <p>Broadcast submitted; waiting for a receipt. A timeout does not mean failure. Check Zeni Activity before retrying.</p>}{transaction.status === 'unknown' && <><p>Check the extension’s Activity and your balances before starting another transaction. Do not submit it twice.</p><button className="vault-secondary" disabled={busy} onClick={() => { setTransaction(null); setRefresh(value => value + 1); }}>I checked Activity — clear this notice</button></>}</> : <p>Connect your wallet to begin. You’ll see the transaction hash and on-chain confirmation here.</p>}
          {(error || wallet.error) && <p role="alert" className="vault-error">{error || wallet.error}</p>}
        </section>
      </div>
      <p className="vault-footnote">Each approval includes QoreChain’s authorization window and setup fees. Transactions use real testnet QOR. <a href="https://github.com/Trymbakmahant/zeni-wallet/blob/main/packages/contracts/src/ZeniTestVault.sol" target="_blank" rel="noreferrer">Read the contract source ↗</a></p>
    </main>
  </div>;
}

import { useState, type ReactNode } from 'react';
import { Button } from '@ui-sdk/react/button';
import { ArrowDownLeft, ArrowDownUp, ArrowUpRight, Check, ChevronDown, Clock3, Globe, Layers3, Settings2, ShieldCheck, Wallet, X } from 'lucide-react';
import './extension-showcase.css';

type Decision = 'approved' | 'rejected' | null;

function Token({ symbol }: { symbol: string }) {
  return <span aria-hidden="true" className={`showcase-token showcase-token-${symbol.toLowerCase()}`}>{symbol === 'QOR' ? 'Q' : symbol === 'fUSD' ? '$' : symbol === 'fETH' ? '♦' : '₿'}</span>;
}

function Screen({ title, active, children }: { title: string; active: 'wallet' | 'activity'; children: ReactNode }) {
  return <div className="showcase-screen">
    <div className="showcase-window-bar"><span className="showcase-window-dots" aria-hidden="true"><i /><i /><i /></span><span>ZENI EXTENSION</span><span>PREVIEW</span></div>
    <div className="showcase-app-bar"><span className="showcase-zeni-mark" aria-hidden="true">Z</span><strong>{title}</strong><span className="showcase-network"><i />DIANA</span></div>
    <div className="showcase-screen-content">{children}</div>
    <div className="showcase-app-nav" aria-hidden="true"><span className={active === 'wallet' ? 'is-active' : ''}><Wallet size={13} />Wallet</span><span className={active === 'activity' ? 'is-active' : ''}><Clock3 size={13} />Activity</span><span><Settings2 size={13} />Settings</span></div>
  </div>;
}

function DashboardScreen() {
  return <Screen title="Account 1" active="wallet">
    <div className="showcase-account">0x8F3b…9B2a <span>Testnet</span></div>
    <div className="showcase-balance"><span>QOR balance</span><strong>100.00 <small>QOR</small></strong></div>
    <div className="showcase-quick-actions" aria-label="Available wallet actions"><span><ArrowUpRight size={16} />Send</span><span><ArrowDownLeft size={16} />Receive</span><span><ArrowDownUp size={16} />Swap</span></div>
    <div className="showcase-list-title"><strong>Your assets</strong><span>4 tokens</span></div>
    <ul className="showcase-assets">
      {[{ symbol: 'QOR', name: 'QoreChain', amount: '100.00' }, { symbol: 'fUSD', name: 'Faucet Dollar', amount: '1,000.00' }, { symbol: 'fETH', name: 'Faucet Ether', amount: '0.50' }, { symbol: 'fBTC', name: 'Faucet Bitcoin', amount: '0.01' }].map(token => <li key={token.symbol}><Token symbol={token.symbol} /><div><strong>{token.symbol}</strong><span>{token.name}</span></div><b>{token.amount}</b></li>)}
    </ul>
  </Screen>;
}

function SwapScreen() {
  const [reviewing, setReviewing] = useState(false);
  return <Screen title="In-Wallet Swap" active="wallet">
    <div className="showcase-swap-intro"><span>QoreChain native AMM</span><span>0.5% slippage</span></div>
    <div className="showcase-swap-field"><span className="showcase-field-label">You pay</span><div><strong>1.00</strong><span><Token symbol="QOR" />QOR<ChevronDown size={11} /></span></div><small>Balance: 100.00 QOR</small></div>
    <span className="showcase-swap-arrow" aria-hidden="true"><ArrowDownUp size={15} /></span>
    <div className="showcase-swap-field"><span className="showcase-field-label">Estimated receive</span><div><strong>0.081062</strong><span><Token symbol="fUSD" />fUSD<ChevronDown size={11} /></span></div><small>Illustrative quote</small></div>
    <div className="showcase-swap-summary"><p><span>Minimum received</span><strong>0.080656 fUSD</strong></p><p><span>Authorization</span><strong>Hybrid signed</strong></p></div>
    <Button className="showcase-primary" onClick={() => setReviewing(value => !value)}>{reviewing ? 'Back to swap preview' : 'Review demo swap'}<ArrowUpRight size={13} /></Button>
    <p className="showcase-status" role="status">{reviewing ? 'Review the minimum output above. This preview cannot execute a swap.' : 'Sample amounts. Your wallet fetches the live quote and fees.'}</p>
  </Screen>;
}

function ApprovalScreen({ decision, onDecision }: { decision: Decision; onDecision: (value: Decision) => void }) {
  return <Screen title="Review request" active="wallet">
    <div className="showcase-request-origin"><span><Globe size={18} /></span><div><strong>Zeni Vault Lab</strong><small>zeni-wallet.vercel.app</small></div></div>
    <div className="showcase-request-heading">Contract transaction <span>9800</span></div>
    <div className="showcase-request-summary"><span className="showcase-field-label">Contract / destination · deposit()</span><code>0x2836…D29fC1</code><p><span>QOR sent</span><strong>0.01 QOR</strong></p><p><span>Maximum fee</span><strong>0.093755 QOR</strong></p><small>Example fee, including authorization setup.</small></div>
    <div className="showcase-request-note"><ShieldCheck size={14} /><span>You review the amount and setup fees before signing.</span></div>
    <div className="showcase-approval-actions"><Button className="showcase-secondary" onClick={() => onDecision('rejected')}><X size={13} />Reject demo</Button><Button className="showcase-primary" onClick={() => onDecision('approved')}><Check size={13} />Approve demo</Button></div>
    <p className="showcase-status" role="status">{decision === 'approved' ? 'Demo approved. See the Activity preview. Nothing was signed or sent.' : decision === 'rejected' ? 'Demo rejected. Nothing was signed or sent.' : 'Try either choice. This is a simulation.'}</p>
    {decision && <Button className="showcase-reset" onClick={() => onDecision(null)}>Reset preview</Button>}
  </Screen>;
}

function ActivityScreen({ decision }: { decision: Decision }) {
  const items = [
    ...(decision ? [{ title: 'Approval preview', detail: 'Just now · simulation', amount: '0.01 QOR', status: decision === 'approved' ? 'Simulated' : 'Rejected', icon: ShieldCheck }] : []),
    { title: 'Received QOR', detail: 'Today · 10:42', amount: '+100 QOR', status: 'Confirmed', icon: ArrowDownLeft },
    { title: 'Swapped tokens', detail: 'Today · 10:38', amount: 'QOR → fUSD', status: 'Confirmed', icon: ArrowDownUp },
    { title: 'Sent QOR', detail: 'Today · 10:32', amount: '−0.25 QOR', status: 'Pending', icon: ArrowUpRight },
    { title: 'Contract call', detail: 'Yesterday · 18:20', amount: '0.01 QOR', status: 'Confirmed', icon: Layers3 },
  ].slice(0, 4);
  return <Screen title="Activity" active="activity">
    <div className="showcase-activity-heading"><strong>Your recent moves</strong><span>Sample history</span></div>
    <div className="showcase-activity-list" aria-live="polite">{items.map(({ icon: Icon, ...item }) => <div className="showcase-activity-item" key={item.title}><span className="showcase-activity-icon"><Icon size={16} /></span><div><strong>{item.title}</strong><small>{item.detail}</small><span className={`showcase-tx-status ${item.status === 'Pending' ? 'is-pending' : item.status === 'Rejected' ? 'is-rejected' : ''}`}>{item.status === 'Pending' ? <Clock3 size={9} /> : item.status === 'Rejected' ? <X size={9} /> : <Check size={9} />}{item.status}</span></div><b>{item.amount}</b></div>)}</div>
  </Screen>;
}

export function ExtensionShowcase() {
  const [decision, setDecision] = useState<Decision>(null);
  return <section id="extension-preview-section" className="extension-showcase" aria-labelledby="extension-showcase-title">
    <div className="extension-showcase-inner">
      <header className="extension-showcase-heading"><div><span className="eyebrow">A closer look</span><h2 id="extension-showcase-title">Your wallet.<br />Every step in view.</h2></div><p>From your first token to your latest transaction. Explore four views of Zeni, with sample data and no real transactions.</p></header>
      <div className="extension-story-grid">
        <article className="extension-story-card story-assets"><header><span>01 / DASHBOARD</span><h3>Every asset.<br />One home.</h3></header><DashboardScreen /><p className="extension-story-caption">Your tokens and balances, together.</p></article>
        <article className="extension-story-card story-swap"><header><span>02 / SWAP</span><h3>Your tokens.<br />Your terms.</h3></header><SwapScreen /><p className="extension-story-caption">Review the quote. Set your minimum.</p></article>
        <article className="extension-story-card story-approve"><header><span>03 / APPROVAL</span><h3>Your call.<br />Every time.</h3></header><ApprovalScreen decision={decision} onDecision={setDecision} /><p className="extension-story-caption">Every request needs your approval.</p></article>
        <article className="extension-story-card story-activity"><header><span>04 / ACTIVITY</span><h3>Every move.<br />In the open.</h3></header><ActivityScreen decision={decision} /><p className="extension-story-caption">Follow what happened after you signed.</p></article>
      </div>
      <div className="extension-showcase-footer"><span><i />Interactive previews · Diana testnet · Sample balances and fees</span><a href="/vault">Try a real testnet transaction <ArrowUpRight size={15} aria-hidden="true" /></a></div>
    </div>
  </section>;
}

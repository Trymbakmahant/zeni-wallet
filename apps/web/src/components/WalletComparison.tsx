import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from '@ui-sdk/react/accordion';
import { ArrowUpRight, Check, ChevronDown, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import './wallet-comparison.css';

const capabilities = [
  {
    name: 'Post-quantum keys',
    zeni: 'Manages an ML-DSA-87 key alongside your classical key, with on-chain registration when needed.',
    standard: 'Uses classical keys. QoreChain PQ key management needs additional tooling.',
  },
  {
    name: 'Native QOR transfers',
    zeni: 'Signs native transfers with both classical and post-quantum signatures.',
    standard: 'Does not provide QoreChain’s native hybrid-signing flow out of the box.',
  },
  {
    name: 'Contract transactions',
    zeni: 'Handles PQ authorization setup, transaction review and broadcasting in one flow.',
    standard: 'Can send EVM transactions after an appropriate authorization window is opened using PQ-capable tooling.',
  },
  {
    name: 'Website message signing',
    zeni: 'Uses classical signatures today. A developer-facing PQ message-signing API is not available yet.',
    standard: 'Uses classical signatures for ordinary wallet login and message requests.',
  },
];

function WalletArtwork() {
  return <div className="why-wallet-art" aria-hidden="true">
    <div className="why-wallet-halo" />
    <div className="why-wallet-back"><span>ZENI</span><div className="why-wallet-chip" /></div>
    <div className="why-wallet-body"><span className="why-wallet-wordmark">zeni</span><div className="why-wallet-stitch" /><div className="why-wallet-clasp"><span /></div></div>
    <div className="why-key-tag"><KeyRound size={29} strokeWidth={1.7} /></div>
    <div className="why-wallet-shadow" />
  </div>;
}

function ShieldArtwork() {
  return <div className="why-shield-art" aria-hidden="true"><div className="why-shield-rim"><div className="why-shield-face"><ShieldCheck size={88} strokeWidth={1.25} /><span>ML-DSA-87</span></div></div><span className="why-shield-spark why-shield-spark-one">✦</span><span className="why-shield-spark why-shield-spark-two">✦</span></div>;
}

export function WalletComparison() {
  return <section id="why-zeni" aria-labelledby="wallet-comparison-title" className="why-zeni-section">
    <div className="why-zeni-inner">
      <header className="why-zeni-heading"><span className="eyebrow">A little more built in.</span><h2 id="wallet-comparison-title">Why choose Zeni?</h2><p>Made for your everyday moves on QoreChain.</p></header>
      <div className="why-bento">
        <article className="why-card why-wallet-card">
          <WalletArtwork />
          <div className="why-card-copy"><h3>Two keys.<br />One familiar wallet.</h3><p>Your classical and post-quantum keys, together in one place. Zeni handles PQ key registration when you need it.</p></div>
          <span className="why-card-tag">CLASSICAL + ML-DSA-87</span>
        </article>
        <article className="why-card why-native-card">
          <ShieldArtwork />
          <div className="why-card-copy"><span className="why-mini-label">NATIVE QORECHAIN TRANSFERS</span><h3>Two signatures.<br />Working together.</h3><p>Send native QOR with both classical and post-quantum signatures. Built into your wallet, ready for your approval.</p></div>
        </article>
        <article className="why-card why-keys-card">
          <div className="why-card-copy"><h3>Your agent.<br />Your limits.</h3><p>Give an agent its own key. For example: 1 QOR per transfer, 5 QOR per day, for 24 hours. QoreChain enforces the limits. Revoke the session early in Apps.</p></div>
          <div className="why-lock-art" aria-hidden="true"><div className="why-lock-shackle" /><div className="why-lock-body"><Fingerprint size={65} strokeWidth={1.3} /></div><span className="why-lock-key"><KeyRound size={47} strokeWidth={1.4} /></span></div>
        </article>
        <article className="why-card why-approval-card">
          <div className="why-orbit-art" aria-hidden="true"><div className="why-orbit why-orbit-one" /><div className="why-orbit why-orbit-two" /><div className="why-approval-seal"><Check size={54} strokeWidth={2.4} /></div><span className="why-orbit-dot" /></div>
          <div className="why-card-copy"><span className="why-mini-label">CONTRACT TRANSACTIONS · v0.1.4</span><h3>You approve.<br />Zeni handles the setup.</h3><p>Authorization, signing, and broadcasting. One reviewed flow, without switching between tools.</p></div>
          <div className="why-approval-steps" aria-label="Authorize, sign, broadcast"><span>Authorize</span><span aria-hidden="true">→</span><span>Sign</span><span aria-hidden="true">→</span><span>Broadcast</span></div>
          <a href="/vault" className="why-demo-link">Try the vault demo <ArrowUpRight size={18} aria-hidden="true" /></a>
        </article>
        <article className="why-card why-review-card">
          <div className="why-card-copy"><h3>Clear before<br />you confirm.</h3><p>See the destination, amount, and maximum fee. Open the details when you want a closer look.</p></div>
          <div className="why-receipt-art" aria-hidden="true"><div className="why-receipt-top"><span className="why-receipt-icon"><LockKeyhole size={17} /></span><span>YOUR APPROVAL</span><span className="why-receipt-dot" /></div><strong>Review transaction</strong><div className="why-receipt-row"><span>Destination</span><span>0x28…29fC1</span></div><div className="why-receipt-row"><span>Amount</span><span>0.01 QOR</span></div><div className="why-receipt-row"><span>Maximum fee</span><span>Shown upfront</span></div><div className="why-receipt-button"><Check size={15} />Authorize & send</div><small>ILLUSTRATIVE PREVIEW</small></div>
        </article>
      </div>
      <p className="why-build-note">Built for QoreChain Diana testnet. Contract transactions require extension v0.1.4 or later. <a href="/vault">Get the test build <ArrowUpRight size={12} aria-hidden="true" /></a></p>

      <Accordion className="why-comparison-details" collapsible>
        <AccordionItem value="comparison">
          <AccordionHeader><AccordionTrigger className="why-detail-trigger">How does Zeni compare with a standard EVM wallet?<ChevronDown size={18} aria-hidden="true" /></AccordionTrigger></AccordionHeader>
          <AccordionPanel className="why-detail-panel">
            <p>Compared with a wallet such as MetaMask, without extra QoreChain integrations or plugins.</p>
            <div className="why-compare-list">{capabilities.map(row => <div className="why-compare-row" key={row.name}><h4>{row.name}</h4><div><span>Zeni</span><p>{row.zeni}</p></div><div><span>Standard EVM wallet</span><p>{row.standard}</p></div></div>)}</div>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="metamask">
          <AccordionHeader><AccordionTrigger className="why-detail-trigger">Can I still use MetaMask on QoreChain?<ChevronDown size={18} aria-hidden="true" /></AccordionTrigger></AccordionHeader>
          <AccordionPanel className="why-detail-panel"><p>Yes. Register a PQ key and open an EVM authorization window through the QoreChain Dashboard or QoreX, then transact with MetaMask. Supported linked-key and relayer integrations provide another route. Zeni handles the window setup directly in its contract approval flow.</p><a href="https://build.qorechain.io/faq" target="_blank" rel="noreferrer">Read QoreChain’s explanation <ArrowUpRight size={14} aria-hidden="true" /></a></AccordionPanel>
        </AccordionItem>
        <AccordionItem value="signatures">
          <AccordionHeader><AccordionTrigger className="why-detail-trigger">Which signatures are post-quantum?<ChevronDown size={18} aria-hidden="true" /></AccordionTrigger></AccordionHeader>
          <AccordionPanel className="why-detail-panel"><p>Native QOR transfers use hybrid classical and ML-DSA-87 signatures. For contract transactions, the authorization window is hybrid signed; the EVM transaction itself is classical. Website message signing is also classical today. A developer-facing PQ message-signing API is not available yet.</p><a href="/docs#contract-transactions">Read the integration guide <ArrowUpRight size={14} aria-hidden="true" /></a></AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  </section>;
}

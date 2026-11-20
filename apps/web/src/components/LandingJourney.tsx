import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { ArrowDown, ArrowUpRight, Check, Download, Fingerprint, KeyRound, LockKeyhole, Plus, ShieldCheck } from 'lucide-react';
import { Chrome } from './BrandIcons';
import extensionRelease from '../extension-release.json';
import './landing-journey.css';

const STORE = 'https://chromewebstore.google.com/detail/zeni-wallet-%E2%80%94-qorechain-t/aobipbcjmngbpdhocfdgbcpgfdphlikc';
const REPO = 'https://github.com/Trymbakmahant/zeni-wallet';
const protections = [
  { title: 'Your keys stay with you.', copy: 'Your password encrypts your wallet on this device. You keep the recovery phrase.', detail: 'AES-256-GCM · 600,000 PBKDF2 iterations' },
  { title: 'Two signatures. One transfer.', copy: 'Native QOR transfers and swaps use your classical and post-quantum keys together.', detail: 'secp256k1 + ML-DSA-87' },
  { title: 'The final call is yours.', copy: 'Review the amount, destination and fees. For swaps, your reviewed minimum output is enforced.', detail: 'Clear reviews · Slippage protection' },
];

function SecurityVisual({ index }: { index: number }) {
  if (index === 0) return <div className="journey-vault-visual"><div className="journey-vault-top"><span><i />LOCAL VAULT</span><LockKeyhole size={17} /></div><div className="journey-vault-door"><div className="journey-vault-dial"><Fingerprint size={85} strokeWidth={1} /></div><span className="journey-vault-hinge" /><span className="journey-vault-hinge lower" /></div><div className="journey-vault-bottom"><span>ENCRYPTED ON YOUR DEVICE</span><strong>Your keys.<br />Your custody.</strong></div></div>;
  if (index === 1) return <div className="journey-key-visual"><div className="journey-key-card"><span>01 / CLASSICAL</span><KeyRound size={38} strokeWidth={1.1} /><strong>secp256k1</strong><small>The familiar signature.</small></div><span className="journey-key-plus"><Plus size={22} /></span><div className="journey-key-card pq"><span>02 / POST-QUANTUM</span><ShieldCheck size={38} strokeWidth={1.1} /><strong>ML-DSA-87</strong><small>The post-quantum signature.</small></div><div className="journey-key-caption"><Check size={15} />Hybrid-signed native transfers</div></div>;
  return <div className="journey-review-visual"><span className="journey-visual-kicker">REVIEW BEFORE YOU SIGN</span><div className="journey-review-check"><Check size={35} /></div><h3>Ready when<br />you are.</h3><div className="journey-review-lines"><span>Destination<Check size={14} /></span><span>Amount & maximum fees<Check size={14} /></span><span>Your approval<Check size={14} /></span></div><div className="journey-illustrative-button">Review. Then authorize.<ArrowUpRight size={17} /></div><small>ILLUSTRATIVE PREVIEW</small></div>;
}

function AnimatedPanel({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, index === 0 ? [0, .24, .36] : index === 1 ? [.24, .36, .59, .71] : [.59, .71, 1], index === 1 ? [0, 1, 1, 0] : index === 0 ? [1, 1, 0] : [0, 1, 1]);
  const y = useTransform(progress, index === 0 ? [0, .36] : index === 1 ? [.24, .48, .71] : [.59, 1], index === 1 ? [80, 0, -80] : index === 0 ? [0, -80] : [80, 0]);
  const rotate = useTransform(progress, [0, .5, 1], index === 0 ? [-4, -9, -12] : index === 1 ? [5, 0, -5] : [9, 5, 0]);
  const scale = useTransform(progress, [0, .5, 1], index === 0 ? [1, .94, .9] : index === 1 ? [.94, 1, .94] : [.9, .96, 1]);
  return <motion.div className="journey-animated-panel" data-panel={index} style={{ opacity, y, rotate, scale }}><SecurityVisual index={index} /></motion.div>;
}

function SecurityStory({ animated }: { animated: boolean }) {
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ['start 130px', 'end end'] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', value => {
    const next = Math.min(2, Math.floor(Math.max(0, value) * 3));
    setActive(current => current === next ? current : next);
  });
  return <section id="pqc" ref={section} className={`security-journey ${animated ? 'is-scrubbing' : 'is-static'}`} aria-labelledby="security-journey-title" data-stage={animated ? active : 'static'}>
    <div className="security-journey-sticky">
      <div className="security-journey-copy"><span className="journey-eyebrow">THE WALLET BEHIND THE WALLET</span><h2 id="security-journey-title">Built around<br /><em>your approval.</em></h2><p className="security-journey-intro">Local keys. Native hybrid signing. A clear moment to confirm every move.</p>
        <ol className="journey-chapters">{protections.map((step, index) => <li key={step.title} data-active={!animated || active === index}><span className="journey-chapter-number">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.copy}</p><small>{step.detail}</small></div></li>)}</ol>
        {animated && <div className="journey-scroll-hint"><ArrowDown size={13} />SCROLL TO EXPLORE<span>0{active + 1} / 03</span></div>}
        <a className="journey-security-link" href="/docs#contract-transactions">Understand the signing flow <ArrowUpRight size={14} /></a>
      </div>
      {animated && <div className="journey-artboard" aria-hidden="true"><div className="journey-artboard-grid" /><div className="journey-artboard-orbit" /><span className="journey-artboard-label">ZENI / UNDER THE SURFACE</span>{protections.map((_, index) => <AnimatedPanel key={index} index={index} progress={scrollYProgress} />)}<div className="journey-scroll-track"><motion.div style={{ scaleX: scrollYProgress }} /></div></div>}
    </div>
  </section>;
}

export function InstallSection() {
  return <section id="try-now" className="journey-install" aria-labelledby="journey-install-title"><div id="download" className="journey-install-inner"><div className="journey-install-copy"><span className="journey-eyebrow">AVAILABLE ON THE CHROME WEB STORE</span><h2 id="journey-install-title">Your next move.<br /><em>Make it Zeni.</em></h2><p>A wallet for QoreChain Diana, with your keys on your device and your approval at every step.</p><a href={STORE} target="_blank" rel="noreferrer" className="journey-install-button"><Chrome size={20} />Add Zeni to Chrome<ArrowUpRight size={18} /></a><span className="journey-install-meta"><i />Chrome extension · Diana testnet</span></div>
    <div className="journey-install-steps"><span className="journey-install-kicker">FROM INSTALL TO YOUR FIRST TRANSACTION</span><ol>{[{ title: 'Add Zeni', text: 'Install from the Chrome Web Store and pin the extension.' }, { title: 'Make it yours', text: 'Create or restore your wallet. Keep your recovery phrase private.' }, { title: 'Take your first step', text: 'Get testnet QOR, then send, swap or connect to an app.' }].map((step, index) => <li key={step.title}><span>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div>{index === 2 ? <ArrowUpRight size={19} /> : <Check size={17} />}</li>)}</ol><div className="journey-install-version"><span className="journey-version-tag">FOR DEVELOPERS</span><p>Contract calls require v0.1.4 or later. Check your installed version, or use the test build.</p><div><a href={`/downloads/${extensionRelease.filename}`} download={extensionRelease.filename}><Download size={14} />ZIP v{extensionRelease.version}</a><a href={`${REPO}#chrome-extension-qor-transfers`} target="_blank" rel="noreferrer">Install guide<ArrowUpRight size={14} /></a></div></div></div>
    <div className="journey-install-wordmark" aria-hidden="true">zeni<span>↗</span></div>
  </div></section>;
}

export function SecurityJourney() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1000px) and (min-height: 900px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const update = () => setDesktop(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return <SecurityStory animated={desktop} />;
}

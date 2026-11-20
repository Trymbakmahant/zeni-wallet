import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { ArrowDown, ArrowUpRight, BookOpen, Check, Download, Droplets, Fingerprint, KeyRound, LockKeyhole, Plus, ScanLine, ShieldCheck } from 'lucide-react';
import { Chrome, Github } from './BrandIcons';
import { Reveal } from './Motion';
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

function EcosystemLinks() {
  const reduced = useReducedMotion();
  return <section id="ecosystem" className="journey-ecosystem" aria-labelledby="journey-ecosystem-title"><div className="journey-ecosystem-inner"><div className="journey-ecosystem-heading"><span className="eyebrow">YOUR NEXT STOP</span><h2 id="journey-ecosystem-title">Go a little further.</h2><p>The essentials for exploring QoreChain Diana.</p></div><div className="journey-resource-grid">{[
    { icon: Droplets, number: '01', title: 'Get testnet QOR', description: 'Start exploring with tokens from the official Diana faucet.', label: 'Open faucet', href: 'https://dashboard.qorechain.io/faucet' },
    { icon: ScanLine, number: '02', title: 'Follow your transaction', description: 'Look up receipts and account activity. Select Testnet in the explorer.', label: 'Open explorer', href: 'https://explore.qore.network' },
    { icon: BookOpen, number: '03', title: 'Build on QoreChain', description: 'Explore native swaps, network tools and developer documentation.', label: 'Read the docs', href: 'https://docs.qorechain.io' },
  ].map(({ icon: Icon, ...item }, index) => <motion.a key={item.number} href={item.href} target="_blank" rel="noreferrer" initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} onFocus={event => { event.currentTarget.style.opacity = '1'; event.currentTarget.style.transform = 'none'; }} viewport={{ once: true, amount: .2 }} transition={{ duration: .5, delay: reduced ? 0 : index * .08 }} className="journey-resource"><div><span className="journey-resource-icon"><Icon size={24} strokeWidth={1.4} /></span><span>{item.number}</span></div><h3>{item.title}</h3><p>{item.description}</p><span className="journey-resource-link">{item.label}<ArrowUpRight size={17} /></span></motion.a>)}</div><div className="journey-standards"><span>Built with open standards</span><a href="https://csrc.nist.gov/pubs/fips/204/final" target="_blank" rel="noreferrer">ML-DSA-87 / FIPS 204<ArrowUpRight size={12} /></a><a href="https://eips.ethereum.org/EIPS/eip-6963" target="_blank" rel="noreferrer">EIP-6963 wallet discovery<ArrowUpRight size={12} /></a><a href={REPO} target="_blank" rel="noreferrer">Open-source code<Github size={13} /></a></div></div></section>;
}

function InstallSection() {
  const reduced = useReducedMotion();
  return <section id="try-now" className="journey-install" aria-labelledby="journey-install-title"><div id="download" className="journey-install-inner"><Reveal className="journey-install-copy"><span className="journey-eyebrow">AVAILABLE ON THE CHROME WEB STORE</span><h2 id="journey-install-title">Your next move.<br /><em>Make it Zeni.</em></h2><p>A wallet for QoreChain Diana, with your keys on your device and your approval at every step.</p><a href={STORE} target="_blank" rel="noreferrer" className="journey-install-button"><Chrome size={20} />Add Zeni to Chrome<ArrowUpRight size={18} /></a><span className="journey-install-meta"><i />Chrome extension · Diana testnet</span></Reveal>
    <Reveal delay={.12} className="journey-install-steps"><span className="journey-install-kicker">FROM INSTALL TO YOUR FIRST TRANSACTION</span><ol>{[{ title: 'Add Zeni', text: 'Install from the Chrome Web Store and pin the extension.' }, { title: 'Make it yours', text: 'Create or restore your wallet. Keep your recovery phrase private.' }, { title: 'Take your first step', text: 'Get testnet QOR, then send, swap or connect to an app.' }].map((step, index) => <li key={step.title}><span>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div>{index === 2 ? <ArrowUpRight size={19} /> : <Check size={17} />}</li>)}</ol><div className="journey-install-version"><span className="journey-version-tag">FOR DEVELOPERS</span><p>Contract calls require v0.1.4 or later. Check your installed version, or use the test build.</p><div><a href={`/downloads/${extensionRelease.filename}`} download={extensionRelease.filename}><Download size={14} />ZIP v{extensionRelease.version}</a><a href={`${REPO}#chrome-extension-qor-transfers`} target="_blank" rel="noreferrer">Install guide<ArrowUpRight size={14} /></a></div></div></Reveal>
    <motion.div className="journey-install-wordmark" aria-hidden="true" initial={reduced ? false : { y: 60, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true }} transition={{ duration: reduced ? 0 : .8 }}>zeni<span>↗</span></motion.div>
  </div></section>;
}

export function LandingJourney() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1000px) and (min-height: 760px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const update = () => setDesktop(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return <><SecurityStory animated={desktop} /><EcosystemLinks /><InstallSection /></>;
}

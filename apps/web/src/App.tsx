import { ScrollMotionProvider, ScrollScene } from './components/ScrollScene';
import { WalletComparison } from './components/WalletComparison';
import { ExtensionShowcase } from './components/ExtensionShowcase';
import { SecurityJourney, InstallSection } from './components/LandingJourney';
import { Chrome } from './components/BrandIcons';
import { ConnectShowcase } from './docs/ConnectShowcase';
import { CONNECT_DEMO } from './docs/content';
import './docs/connect-landing.css';
import './landing-theme.css';
import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FloatingBadge, ParallaxShowcase, ScrollProgress } from "./components/Motion";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  Clock, Droplets, ExternalLink, FileCheck2,
  Home, KeyRound, LockKeyhole, Menu, Settings,
  ShieldCheck, Wifi, X,
} from "lucide-react";

const CHROME_WEB_STORE = "https://chromewebstore.google.com/detail/zeni-wallet-%E2%80%94-qorechain-t/aobipbcjmngbpdhocfdgbcpgfdphlikc";
const FAUCET = "https://dashboard.qorechain.io/faucet";

type PreviewAction = "Wallet" | "Send" | "Receive" | "Swap" | "Activity" | "Settings";
const actionDetails: Record<PreviewAction, { title: string; description: string }> = {
  Wallet: { title: "Your wallet, at a glance", description: "Explore the sample balances and actions in this interactive preview." },
  Send: { title: "Review before you send", description: "In the extension, enter a recipient and amount, review fees, then authorize your QOR transfer." },
  Receive: { title: "Receive testnet tokens", description: "Copy your own wallet address from the extension. Use the official faucet to get started." },
  Swap: { title: "Swap with a live quote", description: "The extension routes swaps through QoreChain’s native AMM. Review the minimum received and fees before confirming." },
  Activity: { title: "Follow your transaction on-chain", description: "Open Activity in the extension to see transaction status and explorer links. Select Testnet in the QoreChain explorer to view your receipt." },
  Settings: { title: "Make it yours", description: "Manage your account and lock your wallet in the extension. This website never asks for your recovery phrase." },
};

function Logo({ small = false }: { small?: boolean }) {
  return <span className={`zeni-logo ${small ? "zeni-logo-small" : ""}`} aria-hidden="true"><svg width={small ? 17 : 22} height={small ? 17 : 22} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="16" cy="16" r="13" /><path d="M12 12h8v8h-8z" /></svg></span>;
}

function AssetList() {
  return <div className="rounded-2xl bg-white/[0.025] border border-white/5 p-3">
    <div className="text-[12px] font-mono uppercase tracking-wider text-white/45 mb-2">Testnet assets · sample balances</div>
    <div className="space-y-2">
      {[{ name: "QoreChain Native", symbol: "Q", amount: "100.00 QOR", detail: "Chain ID 9800", color: "bg-amber-500" },
        { name: "Faucet Dollar", symbol: "$", amount: "1,000.00 fUSD", detail: "Testnet bank token", color: "bg-blue-500" }].map(asset =>
        <div key={asset.symbol} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/5 p-2.5">
          <div className="flex items-center gap-2"><span className={`w-7 h-7 shrink-0 rounded-full ${asset.color} grid place-items-center text-xs font-bold`}>{asset.symbol}</span>
            <div><div className="text-xs font-bold">{asset.name}</div><div className="text-[12px] text-white/45 font-mono mt-0.5">{asset.detail}</div></div>
          </div>
          <div className="text-right"><div className="text-[12px] font-mono font-bold">{asset.amount}</div><div className="text-[12px] font-mono text-emerald-400 mt-0.5">Testnet</div></div>
        </div>)}
    </div>
  </div>;
}

function PhonePreview() {
  const reduced = useReducedMotion();
  const [action, setAction] = useState<PreviewAction>("Wallet");
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const actions = [{ label: "Send", icon: ArrowUpRight }, { label: "Receive", icon: ArrowDownLeft }, { label: "Swap", icon: ArrowLeftRight }] as const;
  const tabs = [{ label: "Wallet", icon: Home }, { label: "Activity", icon: Clock }, { label: "Settings", icon: Settings }] as const;
  return <div className="phone-frame" aria-label="Interactive wallet concept preview">
    <span className="phone-button phone-button-one" /><span className="phone-button phone-button-two" /><span className="phone-button phone-button-three" /><span className="phone-button phone-button-right" />
    <div className="phone-bezel"><div className="phone-screen">
      <div className="phone-status"><span className="text-[12px] font-semibold">9:41</span><div className="dynamic-island"><span className="status-dot" /><span>QoreChain 9800</span><span className="camera-lens" /></div><div className="flex items-center gap-1"><Wifi size={12} /><span className="battery" /></div></div>
      <div className="px-4 pt-3 pb-4 space-y-3.5 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Logo /><div><div className="text-sm font-bold">Zeni Vault <span className="text-[12px] ml-1 text-emerald-400 font-mono">PREVIEW</span></div><div className="text-[12px] font-mono text-white/45 mt-0.5">0x8F3b...9B2a</div></div></div>
          <span className="text-[12px] font-mono rounded-full border border-white/10 bg-white/5 py-1.5 px-2">ML-DSA-87</span>
        </div>
        <div className="rounded-2xl bg-[#171717] border border-white/10 p-4 shadow-lg">
          <div className="flex justify-between gap-2 text-[12px] font-mono text-white/50"><span>Wallet balance</span><span className="text-emerald-400 flex items-center gap-1"><ShieldCheck size={11} /> Hybrid keys</span></div>
          <div className="text-[28px] sm:text-3xl font-bold font-mono tracking-tight mt-1">100.00 <span className="text-sm font-sans text-white/45 font-normal">QOR</span></div>
          <div className="text-[12px] text-white/45 font-mono mt-1">Sample balance · QoreChain testnet</div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {actions.map(({ label, icon: Icon }) => <button key={label} onClick={() => setAction(label)} aria-pressed={action === label} className={`phone-action ${action === label ? "phone-action-selected" : ""}`}><span className={`w-8 h-8 rounded-full grid place-items-center ${label === "Send" ? "bg-framer-orange/20 text-framer-orange" : "bg-white/10"}`}><Icon size={16} /></span><span>{label}</span></button>)}
          </div>
        </div>
        <div className="phone-operation" aria-live="polite"><AnimatePresence mode="wait" initial={false}><motion.div key={action} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -6 }} transition={{ duration: reduced ? 0 : 0.16 }}>
          <div className="flex justify-between items-center gap-2 mb-2"><span className="text-[12px] font-mono font-bold text-framer-orange flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-framer-orange animate-pulse" />{action === "Wallet" ? "Native AMM swap" : action}</span><span className="text-[12px] font-mono rounded border border-white/10 px-1.5 py-0.5 text-white/50">UI SIMULATION</span></div>
          {action === "Wallet" ? <>
            <div className="text-xs font-semibold">Swap QOR for fUSD on QoreChain</div><div className="text-[12px] text-white/50 font-mono mt-2">Hybrid authorization · reviewed minimum output</div>
            <div className="flex gap-2 mt-3"><button className="flex-1 bg-framer-orange rounded-lg py-2 text-xs font-semibold hover:bg-framer-orangeHover" onClick={() => setDecision("approved")}>Preview approval</button><button className="px-3 py-2 rounded-lg text-xs bg-white/10 hover:bg-white/15" onClick={() => setDecision("rejected")}>Reject</button></div>
            {decision && <p className="text-[12px] text-white/70 mt-2">{decision === "approved" ? "Approval previewed. Nothing was signed or sent." : "Demo request rejected."}</p>}
          </> : <><div className="text-xs font-semibold">{actionDetails[action].title}</div><p className="text-[12px] text-white/60 mt-2 leading-relaxed">{actionDetails[action].description}</p>{action === "Receive" && <a className="text-xs text-framer-orange inline-flex gap-1 items-center mt-2" href={FAUCET} target="_blank" rel="noreferrer">Open faucet <ExternalLink size={12} /></a>}</>}
        </motion.div></AnimatePresence></div>
        <FaucetCard />
        <AssetList />
      </div>
      <div className="border-t border-white/5 px-5 pt-3 pb-2 bg-[#0c0c0d]"><div className="flex justify-around">{tabs.map(({ label, icon: Icon }) => <button key={label} onClick={() => setAction(label)} aria-pressed={action === label} className={`flex flex-col items-center gap-1 text-[12px] py-1 px-2 ${action === label ? "text-framer-orange" : "text-white/45 hover:text-white"}`}><Icon size={16} />{label === "Wallet" ? "Home" : label}</button>)}</div><div className="w-28 h-1 mx-auto mt-3 bg-white/40 rounded-full" /></div>
    </div></div>
  </div>;
}

const badges = [
  { icon: ArrowUpRight, eyebrow: "Review & authorize", title: "Send QOR on-chain", href: "#extension-preview-section", color: "bg-orange-100 text-framer-orange" },
  { icon: ArrowLeftRight, eyebrow: "Native QoreChain AMM", title: "Swap with live quotes", href: "#extension-preview-section", color: "bg-blue-100 text-blue-600" },
  { icon: LockKeyhole, eyebrow: "Encrypted on your device", title: "Your keys. Your wallet.", href: "#pqc", color: "bg-purple-100 text-purple-600" },
  { icon: Droplets, eyebrow: "Official testnet faucet", title: "Claim QOR & tokens", href: FAUCET, color: "bg-emerald-100 text-emerald-600" },
  { icon: KeyRound, eyebrow: "Create or restore", title: "Bring your existing wallet", href: "#download", color: "bg-amber-100 text-amber-600" },
  { icon: FileCheck2, eyebrow: "Activity & explorer", title: "See your on-chain receipt", href: "https://explore.qore.network", color: "bg-rose-100 text-rose-600" },
];

function FaucetCard() {
  return <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
    <div><div className="text-xs font-semibold">Diana Faucet <span className="ml-1 text-[12px] text-framer-orange font-mono">TESTNET</span></div><p className="mt-1 text-[12px] text-white/55">Claim testnet QOR & tokens</p></div>
    <a href={FAUCET} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-white/90">Claim</a>
  </div>;
}

export const App: React.FC = () => {
  const reduced = useReducedMotion();
  const intro = (delay: number) => ({
    initial: reduced ? false as const : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.8, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] as const },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = [{ label: "Wallet", href: "#extension-preview-section" }, { label: "Connect SDK", href: "#connect" }, { label: "Docs", href: "/docs" }, { label: "Security", href: "#pqc" }];
  return <ScrollMotionProvider><div className="site-landing min-h-screen bg-framer-cream text-framer-dark1">
    <ScrollProgress />
    <a href="#main" className="skip-link">Skip to content</a>
    <div className="testnet-banner"><div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1"><span className="testnet-pill"><span className="status-dot" />QoreChain Testnet · 9800</span><span className="hidden sm:inline"><a href={CHROME_WEB_STORE} target="_blank" rel="noreferrer" className="hover:underline"><strong>Now live on the Chrome Web Store</strong> <span aria-hidden="true">↗</span></a></span></div></div>
    <header className="floating-header"><motion.div {...intro(0)} className="nav-capsule"><a href="#hero" className="flex items-center gap-2.5" aria-label="Zeni home"><Logo /><span className="font-bold tracking-tight text-framer-dark1 text-lg">ZENI</span><span className="hidden sm:inline text-[12px] font-mono px-1.5 py-0.5 rounded bg-orange-100 text-framer-dark1/70">PQC VAULT</span></a><nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-framer-dark1/70">{navigation.map(link => <a key={link.href} className="hover:text-framer-orange transition-colors" href={link.href}>{link.label}</a>)}</nav><div className="flex gap-2 items-center"><a href={CHROME_WEB_STORE} target="_blank" rel="noreferrer" className="framer-btn-orange px-3 sm:px-4 py-2 text-xs font-semibold text-white inline-flex gap-2 items-center"><Chrome size={14} />Add to Chrome</a><button className="md:hidden p-2 text-framer-dark1/80" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div></motion.div>
      {menuOpen && <motion.nav {...intro(0)} id="mobile-menu" aria-label="Mobile navigation" className="md:hidden rounded-2xl bg-white border border-orange-100 p-3 mt-2 shadow-xl">{navigation.map(link => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="block p-3 rounded-xl text-sm text-framer-dark1/80 hover:bg-orange-100">{link.label}</a>)}</motion.nav>}
    </header>
    <main id="main">
      <ScrollScene name="hero" variant="hero"><section id="hero" className="relative pt-32 sm:pt-36 pb-16 sm:pb-20 px-5 sm:px-6 overflow-hidden bg-grid-lines"><div className="hero-glow" aria-hidden="true" />
        <div className="max-w-5xl mx-auto text-center flex flex-col items-center relative">
          <motion.div {...intro(0.1)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-framer-dark1/10 bg-white/80 shadow-sm text-[12px] sm:text-xs font-semibold uppercase tracking-wider mb-6"><span className="w-1.5 h-1.5 rounded-full bg-framer-orange animate-pulse" />Now live on the Chrome Web Store</motion.div>
          <motion.h1 {...intro(0.2)} className="text-[44px] sm:text-6xl md:text-7xl font-semibold tracking-[-0.04em] leading-[0.98] max-w-4xl"><span className="text-[#d65329]">Post-quantum keys.</span><br />One familiar wallet.</motion.h1>
          <motion.p {...intro(0.32)} className="mt-6 text-lg sm:text-xl text-framer-dark1/75 max-w-2xl leading-relaxed">Send native QOR with <strong>classical and post-quantum signatures.</strong> Approve contract calls with built-in PQ authorization setup on QoreChain Diana.</motion.p>
          <motion.div {...intro(0.42)} className="mt-8 flex flex-wrap justify-center gap-4"><a href={CHROME_WEB_STORE} target="_blank" rel="noreferrer" className="framer-btn-orange text-white px-7 py-3.5 font-semibold inline-flex gap-2.5 items-center"><Chrome size={20} />Add to Chrome</a><a href="/docs#playground" className="framer-btn-dark text-white px-7 py-3.5 font-semibold inline-flex gap-2 items-center">Try Connect Demo <ArrowUpRight size={17} className="text-white/60" /></a></motion.div>
          <a href="/docs#ai-prompt" className="mt-4 text-sm font-medium underline underline-offset-4 hover:text-framer-orange">Building a dApp? Get an AI integration prompt</a>
          <div className="mt-6 flex flex-wrap justify-center items-center gap-x-4 gap-y-2 text-[12px] sm:text-xs text-framer-dark1/60 font-medium"><span className="flex items-center gap-1.5"><Chrome size={15} className="text-framer-orange" />Chrome Extension</span><span aria-hidden="true">•</span><span>secp256k1 + ML-DSA-87</span><span aria-hidden="true">•</span><span className="font-mono font-semibold text-framer-dark1">Diana testnet · 9800</span></div>
          <ParallaxShowcase badges={badges.map(({ icon: Icon, ...badge }, i) => <FloatingBadge index={i} href={badge.href} key={badge.title} className={`dashed-badge feature-badge ${["feature-badge-0", "feature-badge-1", "feature-badge-2", "feature-badge-3", "feature-badge-4", "feature-badge-5"][i]}`}><div className={`w-9 h-9 rounded-xl shrink-0 grid place-items-center ${badge.color}`}><Icon size={19} /></div><div className="text-left"><div className="text-[12px] lg:text-[12px] font-mono uppercase tracking-wider text-framer-dark1/50">{badge.eyebrow}</div><div className="text-xs lg:text-sm font-bold mt-0.5">{badge.title}</div></div></FloatingBadge>)}><PhonePreview /></ParallaxShowcase>
          <p className="mt-7 max-w-full text-[12px] text-framer-dark1/50 font-mono">Wallet preview · sample balances · QoreChain testnet</p>
        </div>
      </section></ScrollScene>
      <ScrollScene name="why-zeni"><WalletComparison /></ScrollScene>
      <ScrollScene name="wallet-preview"><ExtensionShowcase /></ScrollScene>
      <SecurityJourney />
      <ScrollScene name="connect"><ConnectShowcase /></ScrollScene>
      <section aria-labelledby="ai-integration-title" className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="grid gap-6 border-y border-framer-dark1/15 py-8 md:grid-cols-2 md:items-center">
          <div>
            <p className="mb-3 text-xs font-mono uppercase tracking-wider text-framer-dark1/65">For developers / AI integration guides</p>
            <h2 id="ai-integration-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">Try the button. Then build it.</h2>
          </div>
          <div>
            <p className="text-framer-dark1/75 leading-relaxed">Choose RainbowKit, wagmi, the browser API, or mobile QR. Test the connection, copy the matching code, or give your coding assistant a prompt tailored to your app.</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
              <a href="/docs#playground" className="inline-flex items-center gap-1 hover:underline">Explore the four integrations <ArrowUpRight size={15} /></a>
              <a href="/docs#ai-prompt" className="inline-flex items-center gap-1 hover:underline">Customize an AI prompt <ArrowUpRight size={15} /></a>
            </div>
          </div>
        </div>
      </section>
      <ScrollScene name="install"><InstallSection /></ScrollScene>
    </main>
    <ScrollScene name="footer" variant="footer"><footer className="border-t border-framer-dark1/10 py-10 sm:py-12 px-6 text-xs text-framer-dark1/60"><div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-6"><div className="flex flex-wrap justify-center items-center gap-2"><Logo small /><span className="font-bold text-framer-dark1 text-sm">ZENI WALLET</span><span className="text-[12px] font-mono ml-1">© {new Date().getFullYear()} Zeni · Open source, MIT licensed.</span></div><nav aria-label="Footer navigation" className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-[12px] font-mono"><a href="#hero">Home</a><a href={CHROME_WEB_STORE} target="_blank" rel="noreferrer">Chrome Web Store</a><a href="/docs">Documentation</a><a href="/privacy.html">Privacy policy</a><a href={CONNECT_DEMO} target="_blank" rel="noreferrer">Connect Demo</a><a href="#extension-preview-section">Extension UI</a><a href="#why-zeni">Why Zeni?</a><a href="#pqc">NIST ML-DSA-87</a></nav></div></footer></ScrollScene>
  </div></ScrollMotionProvider>;
};

import { Chrome, Github } from './components/BrandIcons';
import { ConnectShowcase } from './docs/ConnectShowcase';
import { CONNECT_DEMO } from './docs/content';
import './docs/connect-landing.css';
import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FloatingBadge, ParallaxShowcase, Reveal, ScrollProgress } from "./components/Motion";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Check, ChevronRight,
  Clock, Download, Droplets, ExternalLink, FileCheck2, FolderArchive,
  Home, KeyRound, LockKeyhole, Menu, Play, RotateCw, Settings,
  ShieldCheck, Wifi, X,
} from "lucide-react";

const REPO = "https://github.com/Trymbakmahant/zeni-wallet";
const INSTALL = `${REPO}#chrome-extension-qor-transfers`;
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

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <Reveal className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
    <span className="eyebrow">{eyebrow}</span>
    <h2 className="section-title mt-2">{title}</h2>
    <p className="mt-4 text-base sm:text-lg text-framer-dark1/70 leading-relaxed">{children}</p>
  </Reveal>;
}

function AssetList() {
  return <div className="rounded-2xl bg-white/[0.025] border border-white/5 p-3">
    <div className="text-[10px] font-mono uppercase tracking-wider text-white/45 mb-2">Testnet assets · sample balances</div>
    <div className="space-y-2">
      {[{ name: "QoreChain Native", symbol: "Q", amount: "100.00 QOR", detail: "Chain ID 9800", color: "bg-amber-500" },
        { name: "Faucet Dollar", symbol: "$", amount: "1,000.00 fUSD", detail: "Testnet bank token", color: "bg-blue-500" }].map(asset =>
        <div key={asset.symbol} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/5 p-2.5">
          <div className="flex items-center gap-2"><span className={`w-7 h-7 shrink-0 rounded-full ${asset.color} grid place-items-center text-xs font-bold`}>{asset.symbol}</span>
            <div><div className="text-xs font-bold">{asset.name}</div><div className="text-[9px] text-white/45 font-mono mt-0.5">{asset.detail}</div></div>
          </div>
          <div className="text-right"><div className="text-[11px] font-mono font-bold">{asset.amount}</div><div className="text-[9px] font-mono text-emerald-400 mt-0.5">Testnet</div></div>
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
      <div className="phone-status"><span className="text-[11px] font-semibold">9:41</span><div className="dynamic-island"><span className="status-dot" /><span>QoreChain 9800</span><span className="camera-lens" /></div><div className="flex items-center gap-1"><Wifi size={12} /><span className="battery" /></div></div>
      <div className="px-4 pt-3 pb-4 space-y-3.5 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Logo /><div><div className="text-sm font-bold">Zeni Vault <span className="text-[8px] ml-1 text-emerald-400 font-mono">PREVIEW</span></div><div className="text-[10px] font-mono text-white/45 mt-0.5">0x8F3b...9B2a</div></div></div>
          <span className="text-[9px] font-mono rounded-full border border-white/10 bg-white/5 py-1.5 px-2">ML-DSA-87</span>
        </div>
        <div className="rounded-2xl bg-[#171717] border border-white/10 p-4 shadow-lg">
          <div className="flex justify-between gap-2 text-[10px] font-mono text-white/50"><span>Wallet balance</span><span className="text-emerald-400 flex items-center gap-1"><ShieldCheck size={11} /> Hybrid keys</span></div>
          <div className="text-[28px] sm:text-3xl font-bold font-mono tracking-tight mt-1">100.00 <span className="text-sm font-sans text-white/45 font-normal">QOR</span></div>
          <div className="text-[10px] text-white/45 font-mono mt-1">Sample balance · QoreChain testnet</div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {actions.map(({ label, icon: Icon }) => <button key={label} onClick={() => setAction(label)} aria-pressed={action === label} className={`phone-action ${action === label ? "phone-action-selected" : ""}`}><span className={`w-8 h-8 rounded-full grid place-items-center ${label === "Send" ? "bg-framer-orange/20 text-framer-orange" : "bg-white/10"}`}><Icon size={16} /></span><span>{label}</span></button>)}
          </div>
        </div>
        <div className="phone-operation" aria-live="polite"><AnimatePresence mode="wait" initial={false}><motion.div key={action} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -6 }} transition={{ duration: reduced ? 0 : 0.16 }}>
          <div className="flex justify-between items-center gap-2 mb-2"><span className="text-[10px] font-mono font-bold text-framer-orange flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-framer-orange animate-pulse" />{action === "Wallet" ? "Native AMM swap" : action}</span><span className="text-[8px] font-mono rounded border border-white/10 px-1.5 py-0.5 text-white/50">UI SIMULATION</span></div>
          {action === "Wallet" ? <>
            <div className="text-xs font-semibold">Swap QOR for fUSD on QoreChain</div><div className="text-[10px] text-white/50 font-mono mt-2">Hybrid authorization · reviewed minimum output</div>
            <div className="flex gap-2 mt-3"><button className="flex-1 bg-framer-orange rounded-lg py-2 text-xs font-semibold hover:bg-framer-orangeHover" onClick={() => setDecision("approved")}>Preview approval</button><button className="px-3 py-2 rounded-lg text-xs bg-white/10 hover:bg-white/15" onClick={() => setDecision("rejected")}>Reject</button></div>
            {decision && <p className="text-[10px] text-white/70 mt-2">{decision === "approved" ? "Approval previewed. Nothing was signed or sent." : "Demo request rejected."}</p>}
          </> : <><div className="text-xs font-semibold">{actionDetails[action].title}</div><p className="text-[11px] text-white/60 mt-2 leading-relaxed">{actionDetails[action].description}</p>{action === "Receive" && <a className="text-xs text-framer-orange inline-flex gap-1 items-center mt-2" href={FAUCET} target="_blank" rel="noreferrer">Open faucet <ExternalLink size={12} /></a>}</>}
        </motion.div></AnimatePresence></div>
        <FaucetCard />
        <AssetList />
      </div>
      <div className="border-t border-white/5 px-5 pt-3 pb-2 bg-[#0c0c0d]"><div className="flex justify-around">{tabs.map(({ label, icon: Icon }) => <button key={label} onClick={() => setAction(label)} aria-pressed={action === label} className={`flex flex-col items-center gap-1 text-[10px] py-1 px-2 ${action === label ? "text-framer-orange" : "text-white/45 hover:text-white"}`}><Icon size={16} />{label === "Wallet" ? "Home" : label}</button>)}</div><div className="w-28 h-1 mx-auto mt-3 bg-white/40 rounded-full" /></div>
    </div></div>
  </div>;
}

const badges = [
  { icon: ArrowUpRight, eyebrow: "Review & authorize", title: "Send QOR on-chain", href: "#demo-send", color: "bg-orange-100 text-framer-orange" },
  { icon: ArrowLeftRight, eyebrow: "Native QoreChain AMM", title: "Swap with live quotes", href: "#demo-swap", color: "bg-blue-100 text-blue-600" },
  { icon: LockKeyhole, eyebrow: "Encrypted on your device", title: "Your keys. Your wallet.", href: "#pqc", color: "bg-purple-100 text-purple-600" },
  { icon: Droplets, eyebrow: "Official testnet faucet", title: "Claim QOR & tokens", href: "#demo-faucet", color: "bg-emerald-100 text-emerald-600" },
  { icon: KeyRound, eyebrow: "Create or restore", title: "Bring your existing wallet", href: "#demo-wallet", color: "bg-amber-100 text-amber-600" },
  { icon: FileCheck2, eyebrow: "Activity & explorer", title: "See your on-chain receipt", href: "#receipts", color: "bg-rose-100 text-rose-600" },
];

function FaucetCard() {
  return <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
    <div><div className="text-xs font-semibold">Diana Faucet <span className="ml-1 text-[9px] text-framer-orange font-mono">TESTNET</span></div><p className="mt-1 text-[10px] text-white/55">Claim testnet QOR & tokens</p></div>
    <a href={FAUCET} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-white/90">Claim</a>
  </div>;
}

const demoSteps = [
  { id: "demo-send", icon: ArrowUpRight, title: "Send QOR", description: "Enter a recipient and amount, review the fee, then authorize your transfer.", detail: "Review Transfer → Authorize & Send", color: "bg-orange-50 text-framer-orange" },
  { id: "demo-swap", icon: ArrowLeftRight, title: "Swap tokens", description: "Choose a supported pair, get a live AMM quote, and check the minimum received before confirming.", detail: "QOR · fUSD · fETH · fBTC", color: "bg-blue-50 text-blue-600" },
  { id: "demo-faucet", icon: Droplets, title: "Claim testnet tokens", description: "Click Claim in the wallet to open the official faucet. Request tokens for your wallet address.", detail: "Diana Faucet · QoreChain testnet", color: "bg-emerald-50 text-emerald-600" },
  { id: "demo-wallet", icon: KeyRound, title: "Create or import", description: "Start fresh, or restore your existing wallet with its 12-word recovery phrase inside the extension.", detail: "Set a password. Keep your phrase private.", color: "bg-purple-50 text-purple-600" },
];

function DemoFlow() {
  const reduced = useReducedMotion();
  return <section id="demo-flow" className="section-space max-w-7xl mx-auto">
    <SectionHeading eyebrow="Inside the Chrome extension" title="One wallet. Four simple moves.">Send, swap, claim, and get started. Here’s what you’ll see in the Zeni testnet demo.</SectionHeading>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {demoSteps.map(({ icon: Icon, ...step }, i) => <Reveal delay={i * 0.08} whileHover={reduced ? undefined : { y: -6 }} id={step.id} key={step.id} className="rounded-3xl bg-white border border-framer-dark1/10 p-6 flex flex-col shadow-sm">
        <div className="flex items-center justify-between mb-6"><span className={`w-11 h-11 rounded-2xl grid place-items-center ${step.color}`}><Icon size={21} /></span><span className="text-xs font-mono text-framer-dark1/35">0{i + 1}</span></div>
        <h3 className="text-xl font-bold tracking-tight">{step.title}</h3><p className="mt-3 text-sm leading-relaxed text-framer-dark1/65 flex-1">{step.description}</p><p className="mt-6 pt-4 border-t border-framer-dark1/10 text-[10px] leading-relaxed font-mono text-framer-dark1/55">{step.detail}</p>
      </Reveal>)}
    </div>
    <Reveal id="receipts" className="mt-6 rounded-3xl bg-framer-dark1 text-white p-6 sm:p-8 flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
      <div className="flex items-start gap-4"><span className="rounded-2xl bg-emerald-500/10 text-emerald-400 p-3"><FileCheck2 size={23} /></span><div><h3 className="text-xl font-semibold">The transaction doesn’t end at Confirm.</h3><p className="mt-2 text-sm text-white/60 leading-relaxed max-w-xl">Follow its status in Activity, then open the transaction in the explorer. Select Testnet to see your QoreChain receipt.</p></div></div>
      <a href="https://explore.qore.network" target="_blank" rel="noreferrer" className="framer-btn-dark shrink-0 px-5 py-3 inline-flex justify-center items-center gap-2 text-sm font-semibold">Open explorer <ExternalLink size={15} /></a>
    </Reveal>
  </section>;
}

function WindowBar({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 px-2 sm:px-4 py-3 mb-4 border-b border-white/10 text-[10px] sm:text-xs text-white/50 font-mono"><span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" /><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" /><span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" /><span className="ml-1 truncate">{children}</span></div>;
}

function ExtensionPreview() {
  const reduced = useReducedMotion();
  const [action, setAction] = useState<PreviewAction>("Wallet");
  const [approval, setApproval] = useState<"approved" | "rejected" | null>(null);
  return <section id="extension-preview-section" className="section-space max-w-7xl mx-auto">
    <SectionHeading eyebrow="A closer look" title="Your wallet. Every step in view.">A preview of balances, actions, and swap review in Zeni. Try the controls below; this website uses sample data and sends no transactions.</SectionHeading>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      <Reveal className="browser-window">
        <WindowBar>chrome-extension://zeni-vault/index.html</WindowBar>
        <div className="dark-panel flex justify-between gap-2 items-center mb-4"><div className="flex gap-2.5 items-center"><Logo /><div><div className="text-sm font-bold">Zeni Account #1</div><div className="text-[10px] font-mono text-white/45 mt-1">0x8F3b...9B2a · Preview account</div></div></div><span className="hidden sm:block text-[10px] font-mono text-white/70 border border-white/10 rounded-lg p-2">QoreChain (9800)</span></div>
        <div className="dark-panel text-center !p-6 mb-4 bg-gradient-to-b from-[#1a1a1a] to-[#141414]"><div className="text-xs font-mono text-white/45">Sample testnet balance</div><div className="text-3xl sm:text-4xl font-bold font-mono tracking-tight mt-2">100.00 <span className="text-base text-white/50">QOR</span></div><span className="inline-block mt-3 text-[10px] text-emerald-400 bg-emerald-500/10 rounded-full px-3 py-1 font-mono">Native transfers + on-chain swaps</span>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6">{(["Send", "Receive", "Swap"] as const).map((label, i) => <button key={label} onClick={() => setAction(label)} aria-pressed={action === label} className={`${i === 0 ? "framer-btn-orange" : "framer-btn-dark"} py-3 text-xs font-bold`}>{label}</button>)}</div>
        </div>
        <div className="mb-4"><FaucetCard /></div>
        <div className="dark-panel space-y-3"><div className="flex justify-between text-xs font-mono text-white/50"><span>Wallet protection</span><span className="text-framer-orange">Local vault</span></div><div className="grid grid-cols-2 gap-2 font-mono"><div className="mini-panel"><div className="text-[10px] text-white/40">Classical key</div><div className="text-xs mt-1">secp256k1 (BIP-44)</div></div><div className="mini-panel"><div className="text-[10px] text-white/40">Post-quantum key</div><div className="text-xs mt-1">ML-DSA-87</div></div></div><div className="mini-panel text-xs flex justify-between gap-2"><span className="text-white/50">Network fees</span><span className="text-emerald-400">Reviewed before signing</span></div>
          <div className="text-xs leading-relaxed min-h-[72px]" aria-live="polite"><strong>{actionDetails[action].title}</strong><p className="text-white/55 mt-1">{actionDetails[action].description}</p>{action === "Receive" && <a href={FAUCET} target="_blank" rel="noreferrer" className="text-framer-orange inline-flex gap-1 mt-2 items-center">Claim testnet tokens <ExternalLink size={12} /></a>}</div>
        </div>
      </Reveal>
      <Reveal delay={0.14} className="browser-window relative !border-framer-orange !border-2">
        <span className="absolute -top-3 right-6 bg-framer-orange text-[10px] font-mono font-bold text-white px-3 py-1 rounded-full uppercase tracking-wider">Approval preview</span>
        <WindowBar>Zeni · Review swap request</WindowBar>
        <div className="dark-panel flex items-center gap-3 mb-4"><span className="w-10 h-10 rounded-xl bg-framer-orange/15 text-framer-orange grid place-items-center shrink-0"><ArrowLeftRight size={21} /></span><div><div className="text-sm font-bold">QoreChain native AMM</div><div className="text-[10px] font-mono text-white/45 mt-1">Built-in swap · Sample request</div></div><span className="ml-auto text-[9px] font-mono text-blue-300 bg-blue-500/10 rounded border border-blue-500/20 px-2 py-1">DEMO</span></div>
        <div className="dark-panel mb-4 space-y-4"><div className="detail-row"><span>Requested action</span><strong className="text-framer-orange">SwapExactIn</strong></div><div className="detail-row"><span>Route</span><strong>QOR → fUSD</strong></div><div className="rounded-xl bg-framer-dark3 p-4 border border-white/5 space-y-3"><div className="detail-row"><span>You pay</span><strong>1.00 QOR</strong></div><div className="detail-row"><span>Estimated receive</span><strong className="text-emerald-400">0.081062 fUSD</strong></div><div className="detail-row"><span>Minimum received</span><strong>0.080656 fUSD</strong></div><div className="detail-row border-t border-white/5 pt-3"><span>Network fee</span><strong>Quoted in extension</strong></div></div></div>
        <div className="mini-panel mb-5 space-y-2"><div className="detail-row"><span>Authorization</span><strong>secp256k1 + ML-DSA-87</strong></div><div className="detail-row"><span>Slippage tolerance</span><strong className="text-framer-orange">0.5%</strong></div></div>
        <div className="grid grid-cols-2 gap-3"><button className="framer-btn-orange py-3.5 text-xs sm:text-sm font-bold inline-flex gap-2 items-center justify-center" onClick={() => setApproval("approved")}><Check size={16} /> Preview approval</button><button className="framer-btn-dark py-3.5 text-xs sm:text-sm font-semibold" onClick={() => setApproval("rejected")}>Reject request</button></div>
        <motion.div key={approval ?? "ready"} initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.25 }} className="mt-4 text-xs text-white/55 leading-relaxed min-h-[40px]" role="status">{approval === "approved" ? "Approval preview complete. In the extension, confirmation signs and broadcasts your transaction. This demo sent nothing." : approval === "rejected" ? "Request rejected. No signature was created and no funds moved." : "Try either action to explore the approval flow. These amounts are illustrative, not a live quote."}</motion.div>
        {approval && <button className="mt-2 text-xs text-framer-orange flex items-center gap-1" onClick={() => setApproval(null)}><RotateCw size={12} /> Reset preview</button>}
      </Reveal>
    </div>
  </section>;
}

const securityCards = [
  { title: "An encrypted local vault", color: "bg-orange-50 text-framer-orange", description: "Create a wallet or import an existing recovery phrase in the extension. Your password encrypts the vault on your device and unlocks it when you return.", footer: "AES-256-GCM · 600,000 PBKDF2 iterations" },
  { title: "Post-quantum authorization", color: "bg-blue-50 text-blue-600", description: "Zeni registers your post-quantum key when needed. Native swaps use hybrid signatures, while QOR sends open a limited authorization window before the EVM transfer.", footer: "ML-DSA-87 + classical secp256k1" },
  { title: "Review before you confirm", color: "bg-emerald-50 text-emerald-600", description: "See transfer fees before sending. For swaps, review the quote, price impact, and minimum received. The signed swap enforces your reviewed minimum output.", footer: "Live quotes · Slippage protection" },
];

export const App: React.FC = () => {
  const reduced = useReducedMotion();
  const intro = (delay: number) => ({
    initial: reduced ? false as const : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.8, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] as const },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = [{ label: "Wallet", href: "#demo-flow" }, { label: "Connect SDK", href: "#connect" }, { label: "Docs", href: "/docs" }, { label: "Security", href: "#pqc" }];
  return <div className="site-landing min-h-screen bg-framer-cream text-framer-dark1">
    <ScrollProgress />
    <a href="#main" className="skip-link">Skip to content</a>
    <div className="testnet-banner"><div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1"><span className="testnet-pill"><span className="status-dot" />QoreChain Testnet · 9800</span><span className="hidden sm:inline"><strong>Zeni Chrome Extension Demo</strong> · Send. Swap. Claim. Create.</span></div></div>
    <header className="floating-header"><motion.div {...intro(0)} className="nav-capsule"><a href="#hero" className="flex items-center gap-2.5" aria-label="Zeni home"><Logo /><span className="font-bold tracking-tight text-white text-lg">ZENI</span><span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/65">PQC VAULT</span></a><nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-white/65">{navigation.map(link => <a key={link.href} className="hover:text-white transition-colors" href={link.href}>{link.label}</a>)}</nav><div className="flex gap-2 items-center"><a href="#try-now" className="framer-btn-orange px-3 sm:px-4 py-2 text-xs font-semibold text-white inline-flex gap-2 items-center"><Play size={14} />Try Now</a><button className="md:hidden p-2 text-white/80" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div></motion.div>
      {menuOpen && <motion.nav {...intro(0)} id="mobile-menu" aria-label="Mobile navigation" className="md:hidden rounded-2xl bg-framer-dark2 border border-white/10 p-3 mt-2 shadow-xl">{navigation.map(link => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="block p-3 rounded-xl text-sm text-white/80 hover:bg-white/10">{link.label}</a>)}</motion.nav>}
    </header>
    <main id="main">
      <section id="hero" className="relative pt-32 sm:pt-36 pb-16 sm:pb-20 px-5 sm:px-6 overflow-hidden bg-grid-lines"><div className="hero-glow" aria-hidden="true" />
        <div className="max-w-5xl mx-auto text-center flex flex-col items-center relative">
          <motion.div {...intro(0.1)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-framer-dark1/10 bg-white/80 shadow-sm text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-6"><span className="w-1.5 h-1.5 rounded-full bg-framer-orange animate-pulse" />Chrome Extension · QoreChain Testnet</motion.div>
          <motion.h1 {...intro(0.2)} className="text-[44px] sm:text-6xl md:text-7xl font-semibold tracking-[-0.04em] leading-[0.98] max-w-4xl">Your wallet.<br />A more connected web.</motion.h1>
          <motion.p {...intro(0.32)} className="mt-6 text-lg sm:text-xl text-framer-dark1/75 max-w-2xl leading-relaxed">Send QOR and swap on QoreChain. Connect your mobile wallet to web apps with a scan. Your keys stay yours, with <strong>every request in view.</strong></motion.p>
          <motion.div {...intro(0.42)} className="mt-8 flex flex-wrap justify-center gap-4"><a href="#try-now" className="framer-btn-orange text-white px-7 py-3.5 font-semibold inline-flex gap-2.5 items-center"><Chrome size={20} />Try Now — Get Extension</a><a href={CONNECT_DEMO} target="_blank" rel="noreferrer" className="framer-btn-dark text-white px-7 py-3.5 font-semibold inline-flex gap-2 items-center">Try Connect Demo <ArrowUpRight size={17} className="text-white/60" /></a></motion.div>
          <div className="mt-6 flex flex-wrap justify-center items-center gap-x-4 gap-y-2 text-[11px] sm:text-xs text-framer-dark1/60 font-medium"><span className="flex items-center gap-1.5"><Chrome size={15} className="text-framer-orange" />Chrome Extension MV3</span><span aria-hidden="true">•</span><span>ML-DSA-87 authorization</span><span aria-hidden="true">•</span><span className="font-mono font-semibold text-framer-dark1">Chain ID 9800</span></div>
          <ParallaxShowcase badges={badges.map(({ icon: Icon, ...badge }, i) => <FloatingBadge index={i} href={badge.href} key={badge.title} className={`dashed-badge feature-badge ${["feature-badge-0", "feature-badge-1", "feature-badge-2", "feature-badge-3", "feature-badge-4", "feature-badge-5"][i]}`}><div className={`w-9 h-9 rounded-xl shrink-0 grid place-items-center ${badge.color}`}><Icon size={19} /></div><div className="text-left"><div className="text-[9px] lg:text-[10px] font-mono uppercase tracking-wider text-framer-dark1/50">{badge.eyebrow}</div><div className="text-xs lg:text-sm font-bold mt-0.5">{badge.title}</div></div></FloatingBadge>)}><PhonePreview /></ParallaxShowcase>
          <p className="mt-7 max-w-full text-[11px] text-framer-dark1/50 font-mono">Wallet preview · sample balances · QoreChain testnet</p>
        </div>
      </section>
      <ConnectShowcase />
      <DemoFlow />
      <ExtensionPreview />
      <section id="pqc" className="section-space border-t border-framer-dark1/10"><div className="max-w-5xl mx-auto"><SectionHeading eyebrow="Built into the extension" title="Simple to use. Thoughtful about security.">An encrypted vault, post-quantum authorization, and clear transaction reviews support every step of your testnet experience.</SectionHeading><div className="grid grid-cols-1 md:grid-cols-3 gap-6">{securityCards.map((card, i) => <Reveal delay={i * 0.09} whileHover={reduced ? undefined : { y: -6 }} key={card.title} className="p-6 rounded-3xl bg-white border border-framer-dark1/10 shadow-sm flex flex-col"><span className={`w-10 h-10 rounded-2xl grid place-items-center font-mono font-bold text-sm mb-4 ${card.color}`}>0{i + 1}</span><h3 className="text-xl font-bold tracking-tight break-words">{card.title}</h3><p className="mt-3 text-sm text-framer-dark1/70 leading-relaxed flex-1">{card.description}</p><div className="mt-6 pt-4 border-t border-framer-dark1/10 font-mono text-xs text-framer-dark1/60">{card.footer}</div></Reveal>)}</div>

      </div></section>
      <section id="ecosystem" className="section-space bg-[#f7f3ee] border-t border-framer-dark1/10"><div className="max-w-5xl mx-auto"><SectionHeading eyebrow="The QoreChain ecosystem" title="Built for a Connected Web3">Explore the network, get testnet tokens, and follow the open-source tools and standards behind the wallet.</SectionHeading><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">{[
        { mark: "AMM", name: "Native swaps", detail: "QoreChain DEX", href: "https://docs.qorechain.io", color: "bg-purple-50 text-purple-600" },
        { mark: "QOR", name: "Diana Faucet", detail: "Testnet tokens", href: FAUCET, color: "bg-amber-50 text-amber-600" },
        { mark: "TX", name: "Explorer", detail: "On-chain receipts", href: "https://explore.qore.network", color: "bg-blue-50 text-blue-600" },
        { mark: "SRC", name: "Chrome wallet", detail: "Extension source", href: `${REPO}/tree/main/apps/extension`, color: "bg-emerald-50 text-emerald-600" },
        { mark: "PQC", name: "ML-DSA", detail: "NIST FIPS 204", href: "https://csrc.nist.gov/pubs/fips/204/final", color: "bg-rose-50 text-rose-600" },
        { mark: "EIP", name: "EIP-6963", detail: "Wallet discovery", href: "https://eips.ethereum.org/EIPS/eip-6963", color: "bg-indigo-50 text-indigo-600" },
      ].map((item, i) => <motion.a initial={reduced ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : i * 0.05 }} whileHover={reduced ? undefined : { y: -5 }} whileTap={reduced ? undefined : { scale: 0.97 }} onFocus={event => { event.currentTarget.style.opacity = "1"; }} key={item.mark} href={item.href} target="_blank" rel="noreferrer" className="ecosystem-card"><span className={`w-10 h-10 rounded-xl grid place-items-center font-bold text-xs ${item.color}`}>{item.mark}</span><span className="text-xs font-bold mt-1">{item.name}</span><span className="text-[9px] font-mono text-framer-dark1/50">{item.detail}</span></motion.a>)}</div></div></section>
      <section id="try-now" className="section-space max-w-5xl mx-auto">
        <Reveal id="download" className="download-card text-left sm:text-center relative">
          <span className="eyebrow">Developer Preview · QoreChain Testnet</span>
          <h2 className="section-title mt-3 text-white relative">Try Zeni in Chrome Today</h2>
          <p className="text-white/70 mt-4 max-w-2xl mx-auto leading-relaxed relative text-sm sm:text-base">
            Experience post-quantum smart account security on QoreChain Diana Testnet. Install the extension in under 60 seconds with developer mode.
          </p>

          <div className="mt-8 p-6 sm:p-8 rounded-3xl bg-white/[0.04] border border-white/10 max-w-2xl mx-auto relative backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold text-white tracking-wide">Zeni Extension v0.1.0</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/60">Manifest V3</span>
                </div>
                <div className="text-xs text-white/50 font-mono mt-1">Direct zip package · Chrome, Brave & Edge</div>
              </div>

              <a
                href="/zeni-wallet-extension.zip"
                download="zeni-wallet-extension.zip"
                className="framer-btn-orange w-full sm:w-auto px-6 py-3.5 font-semibold text-white inline-flex items-center justify-center gap-2.5 text-sm shrink-0"
                onClick={(e) => {
                  fetch("/zeni-wallet-extension.zip", { method: "HEAD" })
                    .then(res => {
                      if (!res.ok) {
                        alert("The release package zip will be attached here soon! You can also build it locally with 'pnpm zip:ext' or follow the steps below.");
                      }
                    })
                    .catch(() => {});
                }}
              >
                <Download size={18} />
                Download Zip
              </a>
            </div>

            <p className="text-[11px] font-mono text-white/40 mt-4 text-center">
              Pre-compiled distribution bundle. Download, unzip, and load directly into Chrome.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left relative">
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="w-8 h-8 rounded-xl bg-framer-orange/20 text-framer-orange grid place-items-center font-mono font-bold text-xs">01</span>
                <FolderArchive size={16} className="text-white/40" />
              </div>
              <h4 className="text-sm font-bold text-white">1. Download & Unpack</h4>
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                Click <strong>Download Zip</strong> above and extract the <code className="text-[11px] text-framer-orange bg-black/40 px-1 py-0.5 rounded">.zip</code> package to a folder on your computer.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 grid place-items-center font-mono font-bold text-xs">02</span>
                <Chrome size={16} className="text-white/40" />
              </div>
              <h4 className="text-sm font-bold text-white">2. Open Extensions</h4>
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                Open Chrome, Brave, or Edge and navigate to <code className="text-[11px] text-white/80 bg-black/40 px-1 py-0.5 rounded">chrome://extensions</code> in a new tab.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 grid place-items-center font-mono font-bold text-xs">03</span>
                <Settings size={16} className="text-white/40" />
              </div>
              <h4 className="text-sm font-bold text-white">3. Developer Mode</h4>
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                Toggle the <strong>Developer mode</strong> switch in the top-right corner of the Extensions dashboard.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 grid place-items-center font-mono font-bold text-xs">04</span>
                <Check size={16} className="text-white/40" />
              </div>
              <h4 className="text-sm font-bold text-white">4. Load Unpacked</h4>
              <p className="text-xs text-white/60 mt-2 leading-relaxed">
                Click <strong>Load unpacked</strong> and select the unzipped directory. Zeni is now pinned and ready to use!
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center items-center gap-4 text-xs font-mono text-white/50 relative">
            <span>Prefer building from repository source?</span>
            <a href={INSTALL} target="_blank" rel="noreferrer" className="text-framer-orange hover:underline inline-flex items-center gap-1">
              <Github size={13} /> View Build Guide on GitHub <ArrowUpRight size={12} />
            </a>
          </div>
        </Reveal>
      </section>
    </main>
    <footer className="border-t border-framer-dark1/10 py-10 sm:py-12 px-6 text-xs text-framer-dark1/60"><div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-6"><div className="flex flex-wrap justify-center items-center gap-2"><Logo small /><span className="font-bold text-framer-dark1 text-sm">ZENI WALLET</span><span className="text-[10px] font-mono ml-1">© {new Date().getFullYear()} Zeni · Open source, MIT licensed.</span></div><nav aria-label="Footer navigation" className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-[11px] font-mono"><a href="#hero">Home</a><a href="/docs">Documentation</a><a href={CONNECT_DEMO} target="_blank" rel="noreferrer">Connect Demo</a><a href="#extension-preview-section">Extension UI</a><a href="#pqc">NIST ML-DSA-87</a><a href="#ecosystem">QoreChain 9800</a></nav></div></footer>
  </div>;
};

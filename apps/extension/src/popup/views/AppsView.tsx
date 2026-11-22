import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Check,
  CircleCheck,
  Copy,
  Globe,
  Hourglass,
  Link2,
  Mail,
  Sparkles,
  Stamp,
  Tag,
  Unplug,
  XCircle,
} from "lucide-react";
import {
  ZENI_TOOLS,
  ZENI_ROADMAP,
  type ToolId,
} from "../data/appRegistry";

const sendMessage = (type: string, payload: Record<string, any> = {}): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response && response.success) resolve(response.data);
      else reject(new Error(response?.error || "Background worker error"));
    });
  });

const SubHeader: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <div className="flex items-center gap-2 pt-1 pb-1">
    <button
      onClick={onBack}
      className="w-7 h-7 rounded-lg bg-[#141416] hover:bg-[#1E1E22] border border-[#222226] flex items-center justify-center text-zinc-300 transition-colors cursor-pointer"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
    </button>
    <span className="font-semibold text-sm text-white">{title}</span>
  </div>
);

/* ------------------------------- Zeni Stamp ------------------------------ */

interface StampResult {
  spec: string;
  address: string;
  pqcPublicKey: string;
  message: string;
  payload: string;
  classicalSignature: string;
  pqcSignature: string;
  timestamp: number;
}

const StampTool: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [mode, setMode] = useState<"sign" | "verify">("sign");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState<StampResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [verifyInput, setVerifyInput] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    classicalOk: boolean;
    pqcOk: boolean;
    recovered: string;
  } | null>(null);

  const createStamp = async () => {
    setBusy(true);
    setError(null);
    setStamp(null);
    try {
      const res = await sendMessage("SIGN_MESSAGE", { text });
      setStamp(res.stamp);
    } catch (e: any) {
      setError(e?.message || "Could not create the stamp.");
    } finally {
      setBusy(false);
    }
  };

  const copyStamp = () => {
    if (!stamp) return;
    navigator.clipboard.writeText(JSON.stringify(stamp, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verifyStamp = async () => {
    setVerifyBusy(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(verifyInput);
      } catch {
        throw new Error("That is not valid JSON. Paste the full stamp output.");
      }
      setVerifyResult(await sendMessage("VERIFY_STAMP", { stamp: parsed }));
    } catch (e: any) {
      setVerifyError(e?.message || "Could not verify the stamp.");
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <div className="flex flex-col space-y-3 pb-3">
      <SubHeader title="Zeni Stamp" onBack={onBack} />
      <p className="text-[11px] text-zinc-500 leading-snug px-1">
        Bind any message to your account with a hybrid signature — classical secp256k1 plus
        post-quantum ML-DSA-87. Anyone with the stamp JSON can verify it; no transaction is sent.
      </p>

      {/* Sign / Verify toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#111114] border border-[#222226]">
        {(["sign", "verify"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer capitalize ${
              mode === m ? "bg-white text-black" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {m === "sign" ? "Stamp" : "Verify"}
          </button>
        ))}
      </div>

      {mode === "sign" && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Message to notarize — an agreement, a hash, a statement…"
            className="w-full bg-[#111114] border border-[#222226] rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#E06341]/50 transition-colors resize-none"
          />
          <button
            onClick={() => void createStamp()}
            disabled={busy || !text.trim()}
            className="w-full py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Stamp className="w-3.5 h-3.5" />
            {busy ? "Signing…" : "Create hybrid stamp"}
          </button>
          {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}

          {stamp && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <CircleCheck className="w-4 h-4" /> Hybrid stamp created
              </div>
              <div className="space-y-1 text-[10px] font-mono text-zinc-400">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-600">Signer</span>
                  <span className="text-zinc-300">{stamp.address.slice(0, 10)}…{stamp.address.slice(-6)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-600">secp256k1</span>
                  <span className="text-zinc-300">{stamp.classicalSignature.slice(0, 14)}…</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-600">ML-DSA-87</span>
                  <span className="text-zinc-300">{stamp.pqcSignature.slice(0, 14)}…</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-600">Time</span>
                  <span className="text-zinc-300">{new Date(stamp.timestamp).toLocaleString()}</span>
                </div>
              </div>
              <button
                onClick={copyStamp}
                className="w-full py-2 rounded-xl bg-[#141416] hover:bg-[#1E1E22] border border-[#222226] text-xs font-semibold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                {copied ? "Copied" : "Copy stamp JSON"}
              </button>
            </div>
          )}
        </>
      )}

      {mode === "verify" && (
        <>
          <textarea
            value={verifyInput}
            onChange={(e) => setVerifyInput(e.target.value)}
            rows={6}
            placeholder='Paste a stamp JSON — e.g. {"spec":"zeni-stamp/v1", …}'
            className="w-full bg-[#111114] border border-[#222226] rounded-xl px-3 py-2.5 text-[11px] font-mono text-white placeholder-zinc-600 outline-none focus:border-[#E06341]/50 transition-colors resize-none"
          />
          <button
            onClick={() => void verifyStamp()}
            disabled={verifyBusy || !verifyInput.trim()}
            className="w-full py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <BadgeCheck className="w-3.5 h-3.5" />
            {verifyBusy ? "Verifying…" : "Verify stamp"}
          </button>
          {verifyError && <p className="text-[11px] text-red-400 px-1">{verifyError}</p>}

          {verifyResult && (
            <div
              className={`rounded-2xl border p-3.5 space-y-2 ${
                verifyResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <div
                className={`flex items-center gap-1.5 text-xs font-semibold ${
                  verifyResult.ok ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {verifyResult.ok ? (
                  <>
                    <CircleCheck className="w-4 h-4" /> Valid hybrid stamp
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" /> Invalid stamp
                  </>
                )}
              </div>
              <div className="space-y-1 text-[10px] font-mono">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-600">secp256k1 signature</span>
                  <span className={verifyResult.classicalOk ? "text-emerald-400" : "text-red-400"}>
                    {verifyResult.classicalOk ? "valid" : "invalid"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-600">ML-DSA-87 signature</span>
                  <span className={verifyResult.pqcOk ? "text-emerald-400" : "text-red-400"}>
                    {verifyResult.pqcOk ? "valid" : "invalid"}
                  </span>
                </div>
                {verifyResult.recovered && (
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600">Signer</span>
                    <span className="text-zinc-300">
                      {verifyResult.recovered.slice(0, 10)}…{verifyResult.recovered.slice(-6)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ------------------------------ Connections ------------------------------ */

const ConnectionsTool: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [origins, setOrigins] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const apply = (value: unknown) => {
      setOrigins(Array.isArray(value) ? (value as string[]) : []);
      setLoaded(true);
    };
    try {
      chrome.storage.local.get(["connectedOrigins"], (res) => apply(res?.connectedOrigins));
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string
      ) => {
        if (area === "local" && changes.connectedOrigins) apply(changes.connectedOrigins.newValue);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    } catch {
      setLoaded(true);
    }
  }, []);

  const revoke = async (origin: string) => {
    const next = origins.filter((o) => o !== origin);
    setOrigins(next);
    try {
      await chrome.storage.local.set({ connectedOrigins: next });
    } catch { /* storage unavailable */ }
  };

  const revokeAll = async () => {
    setOrigins([]);
    try {
      await chrome.storage.local.set({ connectedOrigins: [] });
    } catch { /* storage unavailable */ }
  };

  return (
    <div className="flex flex-col space-y-3 pb-3">
      <SubHeader title="Connections" onBack={onBack} />
      <p className="text-[11px] text-zinc-500 leading-snug px-1">
        These sites can see your address and request signatures. Revoking forces a fresh
        connection approval next time.
      </p>

      {loaded && origins.length === 0 && (
        <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center space-y-1">
          <Link2 className="w-5 h-5 text-zinc-600" />
          <span className="font-medium text-zinc-400">No sites connected</span>
          <span>Apps you connect to will appear here.</span>
        </div>
      )}

      {origins.length > 0 && (
        <>
          <div className="flex flex-col divide-y divide-[#18181B]/60">
            {origins.map((origin) => (
              <div key={origin} className="flex items-center gap-3 py-2.5 px-2">
                <div className="w-9 h-9 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/25 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-[#38BDF8]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-white truncate">{origin}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Can view address · request approvals</div>
                </div>
                <button
                  onClick={() => void revoke(origin)}
                  title="Revoke connection"
                  className="w-8 h-8 rounded-lg bg-[#141416] hover:bg-red-500/15 border border-[#222226] hover:border-red-500/40 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                >
                  <Unplug className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => void revokeAll()}
            className="w-full py-2 rounded-xl bg-[#141416] hover:bg-red-500/10 border border-[#222226] hover:border-red-500/30 text-xs font-semibold text-zinc-300 hover:text-red-400 transition-colors cursor-pointer"
          >
            Revoke all
          </button>
        </>
      )}
    </div>
  );
};

/* --------------------------------- Home ---------------------------------- */

const ROADMAP_ICONS = { sessions: Bot, escrow: Hourglass, seal: Mail, names: Tag } as const;

interface LauncherItem {
  id: string;
  name: string;
  accent: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  onClick?: () => void;
  external?: boolean;
  soon?: boolean;
  hint?: string;
}

const AppTile: React.FC<{ item: LauncherItem }> = ({ item }) => {
  const { Icon, accent, soon } = item;
  return (
    <button
      onClick={item.onClick}
      disabled={soon}
      title={item.hint}
      className="flex flex-col items-center gap-1.5 group cursor-pointer disabled:cursor-default"
    >
      <div
        className={`relative w-[52px] h-[52px] rounded-2xl flex items-center justify-center transition-transform ${
          soon ? "" : "group-hover:scale-105 group-active:scale-95"
        }`}
        style={{
          background: soon
            ? "#111114"
            : `linear-gradient(145deg, ${accent}33 0%, ${accent}10 100%)`,
          border: `1px solid ${soon ? "#222226" : `${accent}40`}`,
        }}
      >
        <Icon className="w-[22px] h-[22px]" style={{ color: soon ? "#52525B" : accent }} />
        {item.external && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1A1A1E] border border-[#2A2A2F] flex items-center justify-center">
            <ArrowUpRight className="w-2.5 h-2.5 text-zinc-400" />
          </span>
        )}
        {soon && (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full bg-[#1E1E22] border border-[#2A2A2F] text-zinc-400">
            Soon
          </span>
        )}
      </div>
      <span
        className={`text-[11px] font-medium leading-tight text-center ${
          soon ? "text-zinc-500 mt-0.5" : "text-zinc-200 group-hover:text-white"
        }`}
      >
        {item.name}
      </span>
    </button>
  );
};

export const AppsView: React.FC = () => {
  const [tool, setTool] = useState<ToolId | null>(null);

  if (tool === "stamp") return <StampTool onBack={() => setTool(null)} />;
  if (tool === "connections") return <ConnectionsTool onBack={() => setTool(null)} />;

  const yourApps: LauncherItem[] = [
    { id: "stamp", name: "Stamp", accent: ZENI_TOOLS[0].accent, Icon: Stamp, onClick: () => setTool("stamp") },
    { id: "connections", name: "Connections", accent: ZENI_TOOLS[1].accent, Icon: Link2, onClick: () => setTool("connections") },
  ];
  const comingSoon: LauncherItem[] = ZENI_ROADMAP.map((r) => ({
    id: r.id,
    name: r.name.replace(/^Zeni /, "").replace(/ Send$/, ""),
    accent: r.accent,
    Icon: ROADMAP_ICONS[r.icon],
    soon: true,
    hint: r.tagline,
  }));

  return (
    <div className="flex flex-col pb-3">
      <div className="pt-2 pb-4 px-1 text-[22px] font-bold tracking-tight text-white leading-none">
        Apps
      </div>

      {/* Featured */}
      <button
        onClick={() => setTool("stamp")}
        className="relative overflow-hidden text-left rounded-2xl border border-[#E06341]/30 p-4 cursor-pointer group transition-colors hover:border-[#E06341]/60"
        style={{ background: "radial-gradient(120% 140% at 100% 0%, rgba(224,99,65,0.28) 0%, rgba(224,99,65,0.06) 45%, #0E0E11 75%)" }}
      >
        <Stamp className="absolute -right-3 -bottom-4 w-24 h-24 text-[#E06341]/10 rotate-[-12deg]" />
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[#E06341] mb-2">
          <Sparkles className="w-3 h-3" /> New in Zeni
        </div>
        <div className="text-base font-bold text-white leading-tight">Zeni Stamp</div>
        <div className="text-xs text-zinc-400 mt-1 leading-snug max-w-[220px]">
          Hybrid-sign any message with your post-quantum key.
        </div>
        <span className="inline-flex mt-3 py-1.5 px-4 rounded-full bg-white group-hover:bg-zinc-200 text-black text-xs font-bold transition-colors">
          Open
        </span>
      </button>

      {/* Your apps */}
      <div className="text-sm font-semibold text-white px-1 mt-5 mb-3">Your apps</div>
      <div className="grid grid-cols-4 gap-y-4 gap-x-2">
        {yourApps.map((item) => <AppTile key={item.id} item={item} />)}
      </div>

      {/* Coming soon */}
      <div className="text-sm font-semibold text-white px-1 mt-6 mb-3">Coming soon</div>
      <div className="grid grid-cols-4 gap-y-4 gap-x-2">
        {comingSoon.map((item) => <AppTile key={item.id} item={item} />)}
      </div>
    </div>
  );
};

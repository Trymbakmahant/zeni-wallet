import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Bot,
  Check,
  CircleCheck,
  Copy,
  Globe,
  Hourglass,
  KeyRound,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stamp,
  Tag,
  TriangleAlert,
  Unplug,
  XCircle,
} from "lucide-react";
import { formatUnits, parseUnits } from "ethers";
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

/* ---------------------------- Agent Sessions ----------------------------- */

interface SessionItem {
  pubkeyHex: string;
  scheme: string;
  label: string;
  permissions: string[];
  expiryUnix: number;
  createdAtUnix: number;
  revoked: boolean;
  expired: boolean;
  active: boolean;
  rule?: { id: string; perTxLimit: string; dailyLimit: string; allowedDenoms: string[]; allowedEvmCalls?: string[] };
}

const qor = (uqor: string) => {
  try {
    const v = formatUnits(uqor || "0", 6);
    return v.replace(/\.?0+$/, "") || "0";
  } catch { return "0"; }
};

const timeLeft = (expiryUnix: number) => {
  const s = expiryUnix - Math.floor(Date.now() / 1000);
  if (s <= 0) return "expired";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
};

const SessionsTool: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "create">("list");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ pubkeyHex: string; sessionPrivateKey?: string; hash: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [perTx, setPerTx] = useState("1");
  const [daily, setDaily] = useState("5");
  const [ttl, setTtl] = useState<"1" | "24" | "168">("24");
  const [contract, setContract] = useState("");

  const load = async () => {
    try {
      const res = await sendMessage("LIST_SESSIONS");
      setSessions(res.sessions || []);
      setAccount(res.address || null);
      setListError(null);
    } catch (e: any) {
      setSessions([]);
      setListError(e?.message || "Could not load sessions.");
    }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      let perTxLimit: string, dailyLimit: string;
      try {
        perTxLimit = parseUnits(perTx || "0", 6).toString();
        dailyLimit = parseUnits(daily || "0", 6).toString();
      } catch {
        throw new Error("Enter numeric limits in QOR.");
      }
      const contractAddr = contract.trim().toLowerCase();
      if (contractAddr && !/^0x[0-9a-f]{40}$/.test(contractAddr)) {
        throw new Error("The contract allowlist entry must be a 0x address.");
      }
      const res = await sendMessage("CREATE_SESSION", {
        label, expiryUnix: Math.floor(Date.now() / 1000) + Number(ttl) * 3600,
        perTxLimit, dailyLimit, allowedDenoms: ["uqor"],
        allowedEvmCalls: contractAddr ? [contractAddr] : [],
      });
      setCreated(res);
      setView("list");
      setLabel("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not create the session.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (s: SessionItem) => {
    setBusy(true);
    setError(null);
    try {
      await sendMessage("REVOKE_SESSION", { pubkeyHex: s.pubkeyHex, label: s.label });
      setConfirmRevoke(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not revoke the session.");
    } finally {
      setBusy(false);
    }
  };

  const agentJson = created
    ? JSON.stringify({
        spec: "zeni-session/v1", chainId: "qorechain-diana", scheme: "secp256k1",
        account, pubkeyHex: created.pubkeyHex, privateKey: created.sessionPrivateKey,
      }, null, 2)
    : "";

  if (created) {
    return (
      <div className="flex flex-col space-y-3 pb-3">
        <SubHeader title="Agent key created" onBack={() => setCreated(null)} />
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <CircleCheck className="w-4 h-4" /> Session linked on-chain
          </div>
          <p className="text-[11px] text-zinc-400 leading-snug">
            {created.sessionPrivateKey
              ? "Hand this key to your agent. Its spending limits are enforced by QoreChain — it physically cannot exceed them."
              : "The agent's key is linked. Its limits are enforced by QoreChain."}
          </p>
        </div>
        {created.sessionPrivateKey && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <TriangleAlert className="w-4 h-4" /> Copy now — shown once
            </div>
            <div className="bg-[#0B0B0D] border border-[#222226] rounded-lg p-2.5 text-[10px] font-mono text-zinc-300 break-all leading-relaxed">
              {agentJson}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(agentJson); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="w-full py-2 rounded-xl bg-[#141416] hover:bg-[#1E1E22] border border-[#222226] text-xs font-semibold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              {copied ? "Copied" : "Copy agent key JSON"}
            </button>
          </div>
        )}
        <p className="text-[10px] text-zinc-600 px-1 leading-snug">
          Run the demo agent: node packages/core/scripts/session-agent.mjs --key agent.json — it
          spends inside the mandate, then shows QoreChain rejecting an overspend.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3 pb-3">
      <SubHeader title="Agent Sessions" onBack={onBack} />
      <p className="text-[11px] text-zinc-500 leading-snug px-1">
        Delegate a scoped key to an agent. Per-transaction caps, daily budgets and expiry are
        enforced by QoreChain consensus — not by this app. Revoking takes effect instantly.
      </p>

      {view === "list" && (
        <>
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold text-zinc-400">
              {sessions?.length ? `${sessions.filter((s) => s.active).length} active` : ""}
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => void load()} title="Refresh" className="w-7 h-7 rounded-lg bg-[#141416] hover:bg-[#1E1E22] border border-[#222226] flex items-center justify-center text-zinc-400 transition-colors cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setError(null); setView("create"); }} className="h-7 px-2.5 rounded-lg bg-white hover:bg-zinc-200 text-black text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> New session
              </button>
            </div>
          </div>

          {listError && <p className="text-[11px] text-red-400 px-1">{listError}</p>}

          {sessions && sessions.length === 0 && (
            <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center space-y-1.5">
              <Bot className="w-5 h-5 text-zinc-600" />
              <span className="font-medium text-zinc-400">No sessions yet</span>
              <span className="max-w-[240px]">Create one and give the key to a bot — the chain holds the leash.</span>
            </div>
          )}

          <div className="flex flex-col space-y-2">
            {sessions?.map((s) => (
              <div key={s.pubkeyHex} className="rounded-2xl border border-[#222226] bg-[#111114] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${s.active ? "bg-emerald-500/15 border border-emerald-500/25" : "bg-[#1A1A1E] border border-[#2A2A2F]"}`}>
                    <KeyRound className={`w-4 h-4 ${s.active ? "text-emerald-400" : "text-zinc-600"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-xs text-white truncate">{s.label || "Session"}</div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate">{s.pubkeyHex.slice(0, 18)}…</div>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                    s.active ? "bg-emerald-500/15 text-emerald-400" : s.revoked ? "bg-red-500/15 text-red-400" : "bg-zinc-500/15 text-zinc-400"
                  }`}>
                    {s.revoked ? "revoked" : s.expired ? "expired" : "active"}
                  </span>
                </div>
                {s.rule && (
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-lg bg-[#0B0B0D] border border-[#1E1E22] py-1.5">
                      <div className="text-[9px] text-zinc-600 uppercase">Per tx</div>
                      <div className="text-[11px] font-semibold text-zinc-200">{qor(s.rule.perTxLimit)} QOR</div>
                    </div>
                    <div className="rounded-lg bg-[#0B0B0D] border border-[#1E1E22] py-1.5">
                      <div className="text-[9px] text-zinc-600 uppercase">Daily</div>
                      <div className="text-[11px] font-semibold text-zinc-200">{qor(s.rule.dailyLimit)} QOR</div>
                    </div>
                    <div className="rounded-lg bg-[#0B0B0D] border border-[#1E1E22] py-1.5">
                      <div className="text-[9px] text-zinc-600 uppercase">Expiry</div>
                      <div className="text-[11px] font-semibold text-zinc-200">{timeLeft(s.expiryUnix)}</div>
                    </div>
                  </div>
                )}
                {!!s.rule?.allowedEvmCalls?.length && (
                  <div className="text-[10px] font-mono text-zinc-500 truncate px-0.5">
                    calls locked to {s.rule.allowedEvmCalls[0].slice(0, 12)}…
                  </div>
                )}
                {s.active && confirmRevoke !== s.pubkeyHex && (
                  <button onClick={() => setConfirmRevoke(s.pubkeyHex)} className="w-full py-1.5 rounded-lg bg-[#141416] hover:bg-red-500/10 border border-[#222226] hover:border-red-500/30 text-[11px] font-semibold text-zinc-400 hover:text-red-400 transition-colors cursor-pointer flex items-center justify-center gap-1">
                    <Ban className="w-3 h-3" /> Revoke on-chain
                  </button>
                )}
                {s.active && confirmRevoke === s.pubkeyHex && (
                  <div className="flex gap-1.5">
                    <button onClick={() => setConfirmRevoke(null)} disabled={busy} className="flex-1 py-1.5 rounded-lg bg-[#141416] border border-[#222226] text-[11px] font-semibold text-zinc-400 transition-colors cursor-pointer">Cancel</button>
                    <button onClick={() => void revoke(s)} disabled={busy} className="flex-1 py-1.5 rounded-lg bg-red-500/90 hover:bg-red-500 text-[11px] font-bold text-white transition-colors cursor-pointer disabled:opacity-50">
                      {busy ? "Revoking…" : "Confirm revoke"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}
        </>
      )}

      {view === "create" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide px-1">Label</label>
            <input
              value={label} onChange={(e) => setLabel(e.target.value)} maxLength={64}
              placeholder="Trading bot"
              className="w-full bg-[#111114] border border-[#222226] rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#FBBF24]/50 transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide px-1">Max per tx (QOR)</label>
              <input value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" placeholder="1"
                className="w-full bg-[#111114] border border-[#222226] rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#FBBF24]/50 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide px-1">Max per day (QOR)</label>
              <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" placeholder="5"
                className="w-full bg-[#111114] border border-[#222226] rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-[#FBBF24]/50 transition-colors" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide px-1">Expires after</label>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#111114] border border-[#222226]">
              {([["1", "1 hour"], ["24", "24 hours"], ["168", "7 days"]] as const).map(([v, t]) => (
                <button key={v} onClick={() => setTtl(v)} className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${ttl === v ? "bg-white text-black" : "text-zinc-500 hover:text-zinc-300"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide px-1">Contract allowlist (optional)</label>
            <input
              value={contract} onChange={(e) => setContract(e.target.value)} spellCheck={false}
              placeholder="0x… — agent may call only this contract"
              className="w-full bg-[#111114] border border-[#222226] rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-600 font-mono outline-none focus:border-[#FBBF24]/50 transition-colors"
            />
            <p className="text-[10px] text-zinc-600 px-1 leading-snug">
              Locks the key to one contract — e.g. the ZeniAttestedSend cross-VM pay contract.
              Calls to anything else are rejected by consensus.
            </p>
          </div>
          <div className="rounded-xl border border-[#222226] bg-[#0B0B0D] p-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-zinc-500 leading-snug">
              The agent key can send QOR{contract.trim() ? " and call your allowlisted contract" : ""} only.
              QoreChain rejects anything over the limits, off the allowlist, after expiry, or after
              you revoke — even if this app is offline.
            </p>
          </div>
          {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}
          <button
            onClick={() => void create()} disabled={busy || !label.trim()}
            className="w-full py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Bot className="w-3.5 h-3.5" />
            {busy ? "Linking on-chain…" : "Create session (1 tx)"}
          </button>
          <button onClick={() => setView("list")} className="w-full py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">Back</button>
        </div>
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
  if (tool === "sessions") return <SessionsTool onBack={() => setTool(null)} />;

  const yourApps: LauncherItem[] = [
    { id: "sessions", name: "Sessions", accent: ZENI_TOOLS[2].accent, Icon: Bot, onClick: () => setTool("sessions") },
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
        onClick={() => setTool("sessions")}
        className="relative overflow-hidden text-left rounded-2xl border border-[#FBBF24]/30 p-4 cursor-pointer group transition-colors hover:border-[#FBBF24]/60"
        style={{ background: "radial-gradient(120% 140% at 100% 0%, rgba(251,191,36,0.24) 0%, rgba(251,191,36,0.05) 45%, #0E0E11 75%)" }}
      >
        <Bot className="absolute -right-3 -bottom-4 w-24 h-24 text-[#FBBF24]/10 rotate-[-12deg]" />
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[#FBBF24] mb-2">
          <Sparkles className="w-3 h-3" /> New in Zeni
        </div>
        <div className="text-base font-bold text-white leading-tight">Agent Sessions</div>
        <div className="text-xs text-zinc-400 mt-1 leading-snug max-w-[220px]">
          Give an agent a key. QoreChain enforces the leash — limits, expiry, instant revoke.
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

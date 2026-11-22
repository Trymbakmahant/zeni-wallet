// Zeni Agent Sessions — autonomous agent + attested cross-VM payments.
// The wallet links an agent key on-chain (Apps → Sessions → New session) and shows
// a "zeni-session/v1" JSON once. This script is the agent: it holds ONLY the scoped
// key, signs executions, and a relayer submits them. QoreChain enforces the mandate.
//
// Native send (single):
//   node session-agent.mjs --key agent.json --relayer "phrase" [--to qor1…] [--amount 10000]
//
// Attested cross-VM pay (EVM lane → ZeniAttestedSend → native receipt):
//   node session-agent.mjs --key agent.json --relayer "phrase" \
//     --lane evm --contract 0xContract --to 0xRecipient --amount 10000 --note "invoice-1"
//
// Autonomous loop — polls a tasks file and pays each new entry once:
//   node session-agent.mjs --key agent.json --relayer "phrase" \
//     --lane evm --contract 0xC --loop --tasks ./agent-tasks.json
//   tasks file: [{"to":"0x…","amountUqor":10000,"note":"invoice-1"}, …]  (native lane: "to" may be qor1…)
//
// Owner prep for the EVM lane — open a window listing the bridge + contract:
//   node session-agent.mjs --key agent.json --relayer "phrase" --window --contract 0xC
import { readFileSync, appendFileSync } from "node:fs";
import { ethers } from "ethers";
import { evmToQor, qorToEvm } from "@qorechain/sdk";
import { deriveAccountKeys, QORECHAIN_CONFIG, SessionClient, bytesToHex } from "../dist/index.js";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes(`--${name}`);
const fail = (m) => { console.error(`\n${m}`); process.exit(1); };

const keyArg = arg("key");
const relayerMnemonic = arg("relayer");
if (!keyArg) fail("Missing --key (the agent session JSON from Zeni → Apps → Sessions).");
if (!relayerMnemonic) fail("Missing --relayer <testnet phrase> — a funded account pays network fees.");

const key = JSON.parse(keyArg.trim().startsWith("{") ? keyArg : readFileSync(keyArg, "utf8"));
if (!key.privateKey || !key.account || !key.pubkeyHex) fail("Bad session JSON — expected {account, pubkeyHex, privateKey}.");

const relayer = deriveAccountKeys(relayerMnemonic);
const agentPk = key.privateKey;
const agentPubkey = ethers.getBytes(ethers.SigningKey.computePublicKey(agentPk, true));
if (bytesToHex(agentPubkey) !== key.pubkeyHex.toLowerCase()) fail("The private key does not match pubkeyHex in the session JSON.");

const BRIDGE = "0x0000000000000000000000000000000000000901";
const WEI_PER_UQOR = 10n ** 12n;
const PAY_IFACE = new ethers.Interface([
  "function pay(address to, string note) payable returns (bytes)",
]);

const client = new SessionClient(new ethers.JsonRpcProvider(QORECHAIN_CONFIG.rpcUrls[0], undefined, { staticNetwork: true }));
const step = (s) => console.log(`\n=== ${s} ===`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mySession = async () => {
  const sessions = await client.listSessions(key.account);
  return sessions.find((s) => s.pubkeyHex.toLowerCase() === key.pubkeyHex.toLowerCase());
};

const signDigest = (digest) => ethers.getBytes(new ethers.SigningKey(agentPk).sign(digest).compactSerialized);

/** One authorized native send through the session key. */
const spendNative = async (budget, amountUqor, to, tag) => {
  const { nonce } = await client.sessionNonce(key.account, key.pubkeyHex);
  const amount = `${amountUqor}uqor`;
  const digest = client.buildCosmosAuthDigest({ account: key.account, pubkey: agentPubkey, to, amount, nonce });
  const signature = signDigest(digest);
  try {
    const res = await client.relayExecution(relayer, {
      account: key.account, scheme: "secp256k1", pubkey: agentPubkey, signature,
      to, amount, nonce,
    }, budget, () => {});
    console.log(`[${tag}] tx ${res.hash} — ${res.execution.ok ? "EXECUTED" : `CHAIN REJECTED: ${res.execution.failures.map((f) => f.error).join("; ")}`}`);
    return { ok: res.execution.ok, hash: res.hash };
  } catch (e) {
    console.log(`[${tag}] rejected before inclusion: ${e.update?.error ?? e.message}`);
    return { ok: false, error: e.update?.error ?? e.message };
  }
};

/** One authorized attested cross-VM pay: EVM call → pay(to) → native receipt, atomically. */
const spendAttested = async (budget, amountUqor, to, note, contract, tag) => {
  const { nonce } = await client.sessionNonce(key.account, key.pubkeyHex);
  const value = (BigInt(amountUqor) * WEI_PER_UQOR).toString();
  const gasLimit = BigInt(arg("gas", "700000"));
  const data = ethers.getBytes(PAY_IFACE.encodeFunctionData("pay", [to, note]));
  const digest = await client.buildEvmAuthDigest({
    account: key.account, pubkey: agentPubkey, to: contract, value, data, gasLimit, nonce,
  });
  const signature = signDigest(digest);
  try {
    const res = await client.relayEvmExecution(relayer, {
      account: key.account, scheme: "secp256k1", pubkey: agentPubkey, signature,
      to: contract, value, data, gasLimit, nonce,
    }, budget, () => {});
    console.log(`[${tag}] tx ${res.hash} — ${res.execution.ok ? "EXECUTED (pay + native receipt in one tx)" : `CHAIN REJECTED: ${res.execution.failures.map((f) => f.error).join("; ")}`}`);
    return { ok: res.execution.ok, hash: res.hash };
  } catch (e) {
    console.log(`[${tag}] rejected before inclusion: ${e.update?.error ?? e.message}`);
    return { ok: false, error: e.update?.error ?? e.message };
  }
};

const main = async () => {
  step("session state (as the chain sees it)");
  const mine = await mySession();
  if (!mine) fail(`Key ${key.pubkeyHex.slice(0, 18)}… is not linked to ${key.account}.`);
  console.log(`${mine.label || "session"}: ${mine.revoked ? "REVOKED" : mine.expired ? "EXPIRED" : "active"}, expires ${new Date(mine.expiryUnix * 1000).toISOString()}`);
  if (!mine.active) fail("This session is not active — it is revoked or expired. Re-link it in the wallet.");
  const perTx = BigInt(mine.rule?.perTxLimit ?? "0");
  const daily = BigInt(mine.rule?.dailyLimit ?? "0");
  console.log(`mandate: ≤ ${perTx} uqor/tx, ≤ ${daily} uqor/day, denoms: ${(mine.rule?.allowedDenoms ?? ["any"]).join(",")}`);
  if (mine.rule?.allowedEvmCalls?.length) console.log(`contract allowlist: ${mine.rule.allowedEvmCalls.join(", ")}`);

  const budget = await client.sessionFeeBudget();
  const contract = arg("contract");
  const lane = arg("lane", contract ? "evm" : "native");
  const evmRecipient = (a) => (a.startsWith("0x") ? a : qorToEvm(a));

  // Owner-side prep: open an EVM window that admits the bridge + contract targets.
  if (flag("window")) {
    if (relayer.cosmosAddress !== key.account) fail("--window must be run by the owner (--relayer = owner phrase).");
    if (!contract) fail("--window needs --contract 0x… (the attested-pay contract to admit).");
    const dailyUqor = daily || 50_000_000n;
    const res = await client.openSessionWindow(relayer, {
      blocks: Number(arg("blocks", "6000")), maxTxs: Number(arg("maxtxs", "200")),
      maxValue: arg("windowvalue", dailyUqor.toString()),
      allowedTargets: [contract, BRIDGE],
    }, budget, () => {});
    console.log(`window opened: ${res.hash} — targets [${contract}, ${BRIDGE}]`);
    const w = await client.sessionWindow(key.account);
    console.log(`window live: ${w.live}, txs left: ${w.remainingTxs}, value left: ${w.remainingValue} uqor`);
    return;
  }

  const spend = (amountUqor, to, note, tag) =>
    lane === "evm"
      ? spendAttested(budget, amountUqor, evmRecipient(to), note ?? tag, contract, tag)
      : spendNative(budget, amountUqor, to, tag);

  // Autonomous loop: watch a tasks file; pay each new entry once; die on revoke.
  if (flag("loop")) {
    const tasksPath = arg("tasks", "./agent-tasks.json");
    const interval = Number(arg("interval", "10")) * 1000;
    const logPath = arg("log", "./agent-results.jsonl");
    if (lane === "evm" && !contract) fail("--loop on the evm lane needs --contract 0x…");
    console.log(`\nloop: watching ${tasksPath} every ${interval / 1000}s — drop task objects into the JSON array.`);
    const done = new Set();
    while (true) {
      const s = await mySession();
      if (!s || !s.active) { console.log("session revoked or expired — halting."); break; }
      let tasks = [];
      try { tasks = JSON.parse(readFileSync(tasksPath, "utf8")); } catch { /* missing/invalid file: keep waiting */ }
      for (const [i, t] of (Array.isArray(tasks) ? tasks : []).entries()) {
        const id = `${i}:${JSON.stringify(t)}`;
        if (done.has(id)) continue;
        done.add(id);
        const amountUqor = BigInt(t.amountUqor ?? t.amount ?? 0);
        if (perTx && amountUqor > perTx) {
          console.log(`[task ${i}] REFUSED locally: ${amountUqor} > per-tx cap ${perTx} — not even broadcast.`);
          appendFileSync(logPath, JSON.stringify({ i, refused: true, reason: "over per-tx cap", t }) + "\n");
          continue;
        }
        const r = await spend(amountUqor, t.to, t.note, `task ${i}`);
        appendFileSync(logPath, JSON.stringify({ i, ...r, t }) + "\n");
      }
      await sleep(interval);
    }
    return;
  }

  const to = arg("to") ?? evmToQor(ethers.Wallet.createRandom().address);
  const good = BigInt(arg("amount", "10000"));
  const bad = perTx + 1n;

  if (lane === "evm" && !contract) fail("--lane evm needs --contract 0x… (deploy ZeniAttestedSend first).");

  step(`in-mandate ${lane === "evm" ? "attested pay" : "spend"}: ${good} uqor → ${to}`);
  const ok1 = await spend(good, lane === "evm" ? evmRecipient(to) : to, "zeni agent attested pay", "in-mandate");

  step(`over-limit ${lane === "evm" ? "attested pay" : "spend"}: ${bad} uqor (per-tx cap is ${perTx}) — QoreChain must refuse`);
  const ok2 = await spend(bad, lane === "evm" ? evmRecipient(to) : to, "poisoned request", "overspend");

  step("verdict");
  console.log(JSON.stringify({
    agent: "never held account keys — only the scoped session key",
    lane,
    inMandateExecuted: ok1,
    overspendRejectedByConsensus: !ok2,
  }, null, 2));
};

main().catch((e) => fail(e.stack || String(e)));

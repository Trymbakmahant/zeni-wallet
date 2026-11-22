// Level B spike: prove the live x/abstractaccount path on Diana testnet.
// Creates a disposable owner, links a secp256k1 agent key with spending rules,
// has the agent execute a native send via the owner as relayer, then proves the
// chain itself rejects an overspend and a post-revoke spend.
// Run: node packages/core/scripts/spike-abstractaccount.mjs
import { ethers } from "ethers";
import {
  generateMnemonic, requestFaucet, getNetwork, linkAuthenticatorMsgs,
  signAuthenticatorLinkSecp256k1, fetchAuthenticators, fetchSpendingRules,
  fetchAuthNonce, cosmosAuthSignBytes, executeCosmosMsg, revokeAuthenticatorMsg,
  recommendedGasPriceUqor,
} from "@qorechain/sdk";
import { deriveAccountKeys, QORECHAIN_CONFIG, NativeTransactionClient, NATIVE_GAS_CAP } from "../dist/index.js";

const REST = QORECHAIN_CONFIG.restUrl;
const CHAIN_ID = QORECHAIN_CONFIG.cosmosChainId;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (s, extra = "") => console.log(`\n=== ${s} ===`, extra);

class Client extends NativeTransactionClient {
  async register(account, quote) { return this.ensureRegistered(account, true, quote, () => {}); }
  async broadcast(account, message, quote) { return this.broadcastNative(account, message, false, quote, () => {}); }
  async balance(addr) {
    const j = await this.rest(`/cosmos/bank/v1beta1/balances/${addr}`);
    return j.balances?.find((b) => b.denom === "uqor")?.amount ?? "0";
  }
  async tx(hash) { return this.receipt(hash); }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(QORECHAIN_CONFIG.rpcUrls[0], undefined, { staticNetwork: true });
  const client = new Client(provider);

  step("0. module config");
  const cfg = await client.rest("/qorechain/abstractaccount/v1/config");
  console.log(JSON.stringify(cfg.config ?? cfg));

  step("1. owner");
  const owner = process.env.SPIKE_MNEMONIC
    ? deriveAccountKeys(process.env.SPIKE_MNEMONIC)
    : deriveAccountKeys(generateMnemonic());
  console.log("owner cosmos:", owner.cosmosAddress, "| evm:", owner.classicalAddress);
  if (!process.env.SPIKE_MNEMONIC) console.log("(fresh key — send ~2 QOR to the address above, or rerun with SPIKE_MNEMONIC)");

  step("2. faucet / manual funding");
  try {
    const r = await requestFaucet(getNetwork("testnet"), owner.cosmosAddress);
    console.log("faucet:", JSON.stringify(r));
  } catch (e) { console.log("faucet unavailable, waiting for manual funding:", e.message); }
  for (let i = 0; i < 100; i++) {
    const bal = await client.balance(owner.cosmosAddress).catch(() => "0");
    if (BigInt(bal) > 100000n) { console.log("funded:", bal, "uqor"); break; }
    if (i % 5 === 4) console.log(`waiting for funds… balance=${bal} (send to ${owner.cosmosAddress})`);
    await sleep(3000);
    if (i === 99) throw new Error("owner was never funded");
  }

  step("3. PQC registration (classical bootstrap tx)");
  const gasPrice = await recommendedGasPriceUqor({ rest: REST });
  const quote = { setupFeeCap: "2000000", setupGasPrice: gasPrice }; // 2 QOR cap — generous, actual fee is simulated
  console.log("gasPrice(uqor/gas):", gasPrice);
  await client.register(owner, quote);
  console.log("PQC key registered");

  step("4. agent session key (secp256k1)");
  const agentPk = ethers.Wallet.createRandom().privateKey;
  const agentPubkey = ethers.getBytes(ethers.SigningKey.computePublicKey(agentPk, true));
  const proof = signAuthenticatorLinkSecp256k1({ chainId: CHAIN_ID, account: owner.cosmosAddress, privateKey: ethers.getBytes(agentPk) });
  console.log("agent pubkey:", Buffer.from(agentPubkey).toString("hex"), "| proof scheme:", proof.scheme, "| pubkey match:", Buffer.from(proof.pubkey).equals(Buffer.from(agentPubkey)));

  step("5. link authenticator + spending rules");
  const rule = { id: "agent-daily", perTxLimit: "50000", dailyLimit: "200000", allowedDenoms: ["uqor"], enabled: true };
  const msgs = linkAuthenticatorMsgs({
    owner: owner.cosmosAddress, chainId: CHAIN_ID, scheme: "secp256k1", pubkey: proof.pubkey,
    permissions: ["send"], expiryUnix: Math.floor(Date.now() / 1000) + 3600,
    label: "spike-bot", possessionProof: proof.possessionProof, spendingRule: rule,
  });
  console.log("msgs:", msgs.map((m) => m.typeUrl).join(", "));
  for (const m of msgs) {
    const res = await client.broadcast(owner, m, quote);
    console.log(`broadcast ${m.typeUrl} -> ${res.status} ${res.hash}`);
  }

  step("6. on-chain state");
  const auths = await fetchAuthenticators({ rest: REST, address: owner.cosmosAddress });
  console.log("authenticators:", JSON.stringify(auths, null, 1));
  const rules = await fetchSpendingRules({ rest: REST, address: owner.cosmosAddress });
  console.log("rules:", JSON.stringify(rules, null, 1));

  const recipient = deriveAccountKeys(generateMnemonic()).cosmosAddress;
  const agentSig = async (to, amount, nonce) => {
    const signBytes = cosmosAuthSignBytes({ chainId: CHAIN_ID, account: owner.cosmosAddress, pubkey: agentPubkey, to, amount, nonce });
    const sig = new ethers.SigningKey(agentPk).sign(signBytes);
    return ethers.getBytes(sig.compactSerialized);
  };
  const execute = async (amountUqor, tag) => {
    const nonce = await fetchAuthNonce({ rest: REST, address: owner.cosmosAddress, pubkey: agentPubkey });
    console.log(`[${tag}] auth nonce:`, nonce.nonce);
    const amount = `${amountUqor}uqor`;
    const signature = await agentSig(recipient, amount, nonce.nonce);
    const msg = executeCosmosMsg({
      relayer: owner.cosmosAddress, account: owner.cosmosAddress,
      scheme: "secp256k1", pubkey: agentPubkey, signature,
      to: recipient, amount, nonce: nonce.nonce,
    });
    try {
      const res = await client.broadcast(owner, msg, quote);
      const receipt = await client.tx(res.hash);
      const failed = receipt?.events?.find((e) => e.type === "abstractaccount_execution_failed");
      console.log(`[${tag}] tx ${res.hash} code=${receipt?.code} ${failed ? "EXECUTION_FAILED " + JSON.stringify(failed) : ""}`);
      return { ok: !failed && Number(receipt?.code) === 0, hash: res.hash };
    } catch (e) {
      console.log(`[${tag}] rejected: ${e.update?.error ?? e.message}`);
      return { ok: false, error: e.update?.error ?? e.message };
    }
  };

  step("7. in-mandate spend (10000 uqor <= 50000 per-tx)");
  const ok1 = await execute("10000", "in-mandate");
  console.log("expected SUCCESS:", ok1.ok);

  step("8. over-limit spend (75000 uqor > 50000 per-tx) — chain must reject");
  const ok2 = await execute("75000", "overspend");
  console.log("expected FAILURE:", !ok2.ok);

  step("9. revoke, then spend again — chain must reject");
  const revoke = revokeAuthenticatorMsg({ owner: owner.cosmosAddress, scheme: "secp256k1", pubkey: agentPubkey });
  const rres = await client.broadcast(owner, revoke, quote);
  console.log(`revoke tx -> ${rres.status} ${rres.hash}`);
  const ok3 = await execute("10000", "post-revoke");
  console.log("expected FAILURE:", !ok3.ok);

  step("VERDICT");
  console.log(JSON.stringify({ inMandateSucceeded: ok1.ok, overspendRejected: !ok2.ok, postRevokeRejected: !ok3.ok, linkTxWorks: true }));
}

main().catch((e) => { console.error("\nSPIKE FAILED:", e); process.exit(1); });

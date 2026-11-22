import { ethers } from "ethers";
import {
  linkAuthenticatorMsgs, registerAuthenticatorMsg, revokeAuthenticatorMsg,
  fetchAuthenticators, fetchSpendingRules, fetchAuthNonce, fetchEvmWindow,
  cosmosAuthSignBytes, executeCosmosMsg, executeEvmMsg, evmAuthSignBytes, evmAuthSignBytesV2,
  resolveEvmAuthDigestVersion, openEvmWindowMsg, recommendedGasPriceUqor,
  decodeAuthenticatorExecutions, EXECUTION_FAILED_EVENT, checkEvmGasLimit,
  validateAuthenticatorKey, validateSpendingRules, checkValuePermissionRules,
  type EncodeObject, type SpendingRuleInput, type SpendingRules, type AuthNonce,
} from "@qorechain/sdk";
import { NATIVE_GAS_CAP } from "./native-transaction.js";
import { QORECHAIN_CONFIG } from "../account/constants.js";
import { bytesToHex, hexToBytes } from "../crypto/utils.js";
import { NativeTransactionClient, type NativeFeeBudget, type NativeTxObserver, type NativeTxUpdate } from "./native-transaction.js";
import type { DerivedAccountKeys } from "../crypto/derivation.js";

/** Permissions a session may hold. */
export const SESSION_PERMISSIONS = ["send", "evm"] as const;
export type SessionPermission = (typeof SESSION_PERMISSIONS)[number];
export type SessionScheme = "secp256k1" | "ed25519";

/** What the owner grants when creating a session. All amounts are integer base units. */
export interface SessionGrant {
  /** The agent key's raw public key (33-byte compressed secp256k1, or 32-byte ed25519). */
  pubkey: Uint8Array;
  /** The agent key's signature over the link message — proves the agent holds the key. */
  possessionProof: Uint8Array;
  scheme: SessionScheme;
  label: string;
  expiryUnix: number;
  permissions: SessionPermission[];
  /** Required for value permissions: bounds every execution by consensus. */
  rule: {
    perTxLimit: string;
    dailyLimit: string;
    /** Denoms the key may move; empty = any (still bounded by the limits above). */
    allowedDenoms: string[];
    /** EVM calls the key may make: "0x<contract>" (any function) or "0x<contract>/0x<selector>". */
    allowedEvmCalls?: string[];
    denomLimits?: { denom: string; perTxLimit: string; dailyLimit: string }[];
  };
}

/** A linked key as the chain reports it, normalized for the UI. */
export interface SessionView {
  pubkeyHex: string;
  scheme: string;
  label: string;
  permissions: string[];
  /** Unix seconds. */
  expiryUnix: number;
  createdAtUnix: number;
  revoked: boolean;
  expired: boolean;
  active: boolean;
  /** The rule that bounds this key: its own, or the account's first enabled rule. */
  rule?: { id: string; perTxLimit: string; dailyLimit: string; allowedDenoms: string[]; allowedEvmCalls: string[] };
}

export interface SessionModuleConfig {
  enabled: boolean;
  maxSessionKeys: number;
  maxSpendingRules: number;
  defaultSessionTtlSeconds: number;
}

export interface SessionExecutionResult {
  ok: boolean;
  /** Chain-reported failures, e.g. spending limit / expired / replay, when the outer tx was accepted. */
  failures: { index: number; lane: string; error?: string }[];
}

const UQOR_RE = /^\d+$/;
const EVM_CALL_RE = /^0x[0-9a-fA-F]{40}(\/0x[0-9a-fA-F]{8})?$/;

/** Client-side checks mirroring what the chain enforces; throws with a user-readable message. */
export function validateSessionGrant(grant: SessionGrant, config: SessionModuleConfig): void {
  validateAuthenticatorKey(grant.scheme, grant.pubkey);
  if (!grant.label.trim() || grant.label.length > 64) throw new Error("Give the session a label (64 characters max).");
  if (!grant.permissions.length || grant.permissions.some((p) => !SESSION_PERMISSIONS.includes(p))) {
    throw new Error("A session supports the send and evm permissions.");
  }
  if (!grant.possessionProof.length) throw new Error("The agent key must prove possession before it can be linked.");
  const now = Math.floor(Date.now() / 1000);
  if (grant.expiryUnix <= now + 60) throw new Error("The session must expire more than a minute from now.");
  if (grant.expiryUnix > now + config.defaultSessionTtlSeconds * 7) {
    throw new Error("The session expiry is too far in the future for this network.");
  }
  for (const limit of [grant.rule.perTxLimit, grant.rule.dailyLimit]) {
    if (!UQOR_RE.test(limit)) throw new Error("Session limits must be whole base-unit amounts.");
  }
  if (grant.rule.perTxLimit === "0" && grant.rule.dailyLimit === "0" && !(grant.rule.denomLimits?.length)) {
    throw new Error("Set a per-transaction or daily limit — the chain requires a bounding rule for send sessions.");
  }
  if (grant.rule.perTxLimit !== "0" && grant.rule.dailyLimit !== "0" && BigInt(grant.rule.perTxLimit) > BigInt(grant.rule.dailyLimit)) {
    throw new Error("The per-transaction limit cannot exceed the daily limit.");
  }
  for (const call of grant.rule.allowedEvmCalls ?? []) {
    if (!EVM_CALL_RE.test(call)) {
      throw new Error("Contract allowlist entries must be 0x<address> or 0x<address>/0x<selector>.");
    }
  }
  if (!grant.permissions.includes("evm") && grant.rule.allowedEvmCalls?.length) {
    throw new Error("The evm permission is required for a contract allowlist.");
  }
  checkValuePermissionRules(grant.permissions, [{ ...grant.rule, enabled: true }]);
}

/** Interpret the receipt of a relayed execution: outer success is not enough — the chain may report failure via event. */
export function parseSessionExecution(receipt: any): SessionExecutionResult {
  if (!receipt || Number(receipt.code) !== 0) {
    return { ok: false, failures: [{ index: -1, lane: "cosmos", error: receipt?.raw_log || "Transaction rejected." }] };
  }
  const events = receipt.events ?? [];
  if (events.some((e: any) => e?.type === EXECUTION_FAILED_EVENT)) {
    try {
      const results = decodeAuthenticatorExecutions({ msgResponses: receipt.msg_responses ?? [], events }, undefined);
      const failures = results.filter((r) => !r.success).map((r) => ({ index: r.index, lane: r.lane, error: r.reason || r.vmError || undefined }));
      if (failures.length) return { ok: false, failures };
    } catch { /* fall through to the generic event failure */ }
    return { ok: false, failures: [{ index: -1, lane: "cosmos", error: "The chain reported a failed authorized execution." }] };
  }
  return { ok: true, failures: [] };
}

export class SessionClient extends NativeTransactionClient {
  /** Fee budget for owner-signed session transactions (link / revoke / relay). */
  async sessionFeeBudget(): Promise<NativeFeeBudget> {
    const setupGasPrice = await recommendedGasPriceUqor({ rest: QORECHAIN_CONFIG.restUrl, fetch: this.fetchImpl });
    const price = ethers.parseUnits(setupGasPrice, 12);
    if (price <= 0n) throw new Error("Invalid network fee price.");
    const feeCap = (NATIVE_GAS_CAP * price + 10n ** 12n - 1n) / 10n ** 12n;
    return { setupGasPrice, setupFeeCap: feeCap.toString() };
  }

  /** Register the owner's hybrid key when missing; required before any owner-signed session tx. */
  async ensureSessionReady(account: DerivedAccountKeys, budget: NativeFeeBudget, assertUnlocked: () => void, observer?: NativeTxObserver) {
    return this.ensureRegistered(account, true, budget, assertUnlocked, observer);
  }

  /** Module config: enabled flag, key/rule caps, default TTL. */
  async sessionConfig(): Promise<SessionModuleConfig> {
    const json = await this.rest("/qorechain/abstractaccount/v1/config");
    const c = json.config ?? json;
    return {
      enabled: String(c.enabled) === "true" || c.enabled === true,
      maxSessionKeys: Number(c.max_session_keys ?? 0),
      maxSpendingRules: Number(c.max_spending_rules ?? 0),
      defaultSessionTtlSeconds: Number(c.default_session_ttl ?? 0),
    };
  }

  /** Linked keys + the rules that bound them, as the chain reports. Missing account = no sessions. */
  async listSessions(address: string): Promise<SessionView[]> {
    const missing = (e: any) => e?.status === 404 || /not found/i.test(e?.message ?? "");
    let auths;
    try {
      auths = await fetchAuthenticators({ rest: QORECHAIN_CONFIG.restUrl, address, fetch: this.fetchImpl });
    } catch (e: any) {
      if (missing(e)) return [];
      throw e;
    }
    const rules = await fetchSpendingRules({ rest: QORECHAIN_CONFIG.restUrl, address, fetch: this.fetchImpl })
      .catch((e: any) => { if (missing(e)) return null; throw e; }) as SpendingRules | null;
    const now = Math.floor(Date.now() / 1000);
    const accountRule = rules?.rules.find((r) => r.enabled);
    return auths.map((a) => {
      const own = rules?.authenticatorRules.find((r) => r.pubkeyHex.toLowerCase() === a.pubkeyHex.toLowerCase());
      const rule = own?.rule ?? accountRule;
      const expired = Number(a.expiryUnix) <= now;
      return {
        pubkeyHex: a.pubkeyHex, scheme: a.scheme, label: a.label, permissions: a.permissions,
        expiryUnix: Number(a.expiryUnix), createdAtUnix: Number(a.createdAtUnix),
        revoked: a.revoked, expired, active: !a.revoked && !expired,
        rule: rule ? { id: rule.id, perTxLimit: String(rule.perTxLimit), dailyLimit: String(rule.dailyLimit), allowedDenoms: [...rule.allowedDenoms], allowedEvmCalls: [...rule.allowedEvmCalls] } : undefined,
      };
    });
  }

  /** Link an agent key on-chain: one owner-signed tx carrying rules + registration. */
  async linkSession(account: DerivedAccountKeys, grant: SessionGrant, quote: NativeFeeBudget, assertUnlocked: () => void, observer?: NativeTxObserver): Promise<NativeTxUpdate & { nextSequence: bigint }> {
    const config = await this.sessionConfig();
    if (!config.enabled) throw new Error("Agent sessions are not enabled on this network.");
    validateSessionGrant(grant, config);
    const spendingRule: SpendingRuleInput = {
      id: `zeni-${grant.label.slice(0, 24).replace(/[^a-zA-Z0-9-]/g, "-") || "session"}`,
      perTxLimit: grant.rule.perTxLimit, dailyLimit: grant.rule.dailyLimit,
      allowedDenoms: [...grant.rule.allowedDenoms], denomLimits: grant.rule.denomLimits?.map((d) => ({ ...d })) ?? [],
      enabled: true, allowedEvmCalls: [...(grant.rule.allowedEvmCalls ?? [])],
    };
    const existing = await this.listSessions(account.cosmosAddress);
    if (existing.some((s) => s.pubkeyHex.toLowerCase() === bytesToHex(grant.pubkey) && !s.revoked)) {
      throw new Error("This agent key is already linked to your account.");
    }
    if (existing.filter((s) => !s.revoked).length >= config.maxSessionKeys) {
      throw new Error(`This network allows at most ${config.maxSessionKeys} session keys per account.`);
    }
    const msgs = linkAuthenticatorMsgs({
      owner: account.cosmosAddress, chainId: QORECHAIN_CONFIG.cosmosChainId,
      scheme: grant.scheme, pubkey: grant.pubkey, permissions: [...grant.permissions],
      expiryUnix: grant.expiryUnix, label: grant.label, possessionProof: grant.possessionProof,
      spendingRule,
    });
    assertUnlocked();
    return this.broadcastNative(account, msgs, false, quote, assertUnlocked, observer);
  }

  /** Revoke a linked key on-chain; takes effect immediately. */
  async revokeSession(account: DerivedAccountKeys, session: { scheme: SessionScheme; pubkeyHex: string }, quote: NativeFeeBudget, assertUnlocked: () => void, observer?: NativeTxObserver): Promise<NativeTxUpdate & { nextSequence: bigint }> {
    const msg = revokeAuthenticatorMsg({
      owner: account.cosmosAddress, scheme: session.scheme,
      pubkey: hexToBytes(session.pubkeyHex),
    });
    assertUnlocked();
    return this.broadcastNative(account, msg, false, quote, assertUnlocked, observer);
  }

  /** The authenticator's own execution counter (distinct from the account sequence). */
  async sessionNonce(address: string, pubkeyHex: string): Promise<AuthNonce> {
    return fetchAuthNonce({ rest: QORECHAIN_CONFIG.restUrl, address, pubkey: pubkeyHex, fetch: this.fetchImpl });
  }

  /**
   * Agent-side signing: the session key signs the domain-separated transfer authorization.
   * `signature` is the 64-byte r‖s produced by signing `cosmosAuthSignBytes` output.
   */
  buildCosmosAuthDigest(input: { account: string; pubkey: Uint8Array; to: string; amount: string; nonce: bigint }): Uint8Array {
    return cosmosAuthSignBytes({ chainId: QORECHAIN_CONFIG.cosmosChainId, ...input });
  }

  /** Build the relayer message a session-key signature authorizes (native send lane). */
  buildSessionExecution(input: { relayer: string; account: string; scheme: SessionScheme; pubkey: Uint8Array; signature: Uint8Array; to: string; amount: string; nonce: bigint }): EncodeObject {
    return executeCosmosMsg(input);
  }

  /** Broadcast a relayed execution signed by the session key (the relayer pays fees). */
  async relayExecution(relayer: DerivedAccountKeys, input: { account: string; scheme: SessionScheme; pubkey: Uint8Array; signature: Uint8Array; to: string; amount: string; nonce: bigint }, quote: NativeFeeBudget, assertUnlocked: () => void, observer?: NativeTxObserver): Promise<NativeTxUpdate & { nextSequence: bigint; execution: SessionExecutionResult }> {
    const msg = this.buildSessionExecution({ relayer: relayer.cosmosAddress, ...input });
    assertUnlocked();
    const update = await this.broadcastNative(relayer, msg, false, quote, assertUnlocked, observer);
    return { ...update, execution: parseSessionExecution(update.receipt) };
  }

  /** The EVM authorization window for an account (bridge calls need one listing the targets). */
  async sessionWindow(address: string) {
    return fetchEvmWindow({ rest: QORECHAIN_CONFIG.restUrl, address, fetch: this.fetchImpl });
  }

  /** Open an EVM authorization window for the account (owner-signed, hybrid). */
  async openSessionWindow(account: DerivedAccountKeys, window: { blocks: number; maxTxs: number; maxValue: string; allowedTargets: string[] }, quote: NativeFeeBudget, assertUnlocked: () => void, observer?: NativeTxObserver): Promise<NativeTxUpdate & { nextSequence: bigint }> {
    const msg = openEvmWindowMsg({
      sender: account.cosmosAddress, blocks: window.blocks, maxTxs: window.maxTxs,
      maxValue: window.maxValue, allowedTargets: window.allowedTargets,
    });
    assertUnlocked();
    return this.broadcastNative(account, msg, false, quote, assertUnlocked, observer);
  }

  /**
   * Agent-side digest for an authorized EVM call (v1 or v2 as the chain requires).
   * `value` is wei (aqor); `gasLimit` binds the v2 digest to the call's gas.
   */
  async buildEvmAuthDigest(input: { account: string; pubkey: Uint8Array; to?: string; value?: string; data?: Uint8Array; gasLimit: bigint; nonce: bigint }): Promise<Uint8Array> {
    const version = await resolveEvmAuthDigestVersion({ rest: QORECHAIN_CONFIG.restUrl, fetch: this.fetchImpl });
    const base = {
      chainId: QORECHAIN_CONFIG.cosmosChainId, account: input.account, pubkey: input.pubkey,
      to: input.to ?? "", value: input.value ?? "0", data: input.data ?? new Uint8Array(0), nonce: input.nonce,
    };
    return version === "v2" ? evmAuthSignBytesV2({ ...base, gasLimit: input.gasLimit }) : evmAuthSignBytes(base);
  }

  /** Build the relayer message a session-key signature authorizes (EVM lane). */
  buildSessionEvmExecution(input: { relayer: string; account: string; scheme: SessionScheme; pubkey: Uint8Array; signature: Uint8Array; to?: string; value?: string; data?: Uint8Array; gasLimit: bigint; nonce: bigint }): EncodeObject {
    checkEvmGasLimit(input.gasLimit);
    return executeEvmMsg({
      relayer: input.relayer, account: input.account, scheme: input.scheme, pubkey: input.pubkey,
      signature: input.signature, to: input.to ?? "", value: input.value ?? "0",
      data: input.data ?? new Uint8Array(0), gasLimit: input.gasLimit, nonce: input.nonce,
    });
  }

  /** Broadcast a relayed EVM-lane execution signed by the session key. */
  async relayEvmExecution(relayer: DerivedAccountKeys, input: { account: string; scheme: SessionScheme; pubkey: Uint8Array; signature: Uint8Array; to?: string; value?: string; data?: Uint8Array; gasLimit: bigint; nonce: bigint }, quote: NativeFeeBudget, assertUnlocked: () => void, observer?: NativeTxObserver): Promise<NativeTxUpdate & { nextSequence: bigint; execution: SessionExecutionResult }> {
    const msg = this.buildSessionEvmExecution({ relayer: relayer.cosmosAddress, ...input });
    assertUnlocked();
    const update = await this.broadcastNative(relayer, msg, false, quote, assertUnlocked, observer);
    return { ...update, execution: parseSessionExecution(update.receipt) };
  }
}

export { validateSpendingRules, registerAuthenticatorMsg };

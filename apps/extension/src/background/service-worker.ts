import {
  QORECHAIN_CONFIG,
  validateDappRequest,
  DappIntent,
  QoreChainClient,
  DerivedAccountKeys,
  EncryptedVaultEnvelope,
  deriveAccountKeys,
  isValidMnemonic,
  repairPqcPublicKeyHash,
  QorTransferClient,
  QorTransferQuote,
  AmmSwapClient,
  AmmQuote,
  NativeTxError,
  NativeTxUpdate,
  swapReceivedAmount,
  transactionExplorerUrl,
  evmToBech32Address,
  bech32ToEvmAddress,
  encryptVault,
  decryptVault,
} from "@zeni/core";
import { ethers, formatEther, parseEther } from "ethers";

interface PendingRequest {
  internalId: string;
  clientReqId: number;
  origin: string;
  title?: string;
  favIconUrl?: string;
  payload: { method: string; params?: any[] };
  account?: string;
  intent?: DappIntent;
  quote?: QorTransferQuote;
  quoteVersion?: number;
  state: "PENDING" | "APPROVED" | "SIGNING" | "SUBMITTED" | "CONFIRMED" | "FAILED";
  createdAt: number;
  expiresAt: number;
  port?: chrome.runtime.Port;
}

interface VaultData {
  mnemonic: string;
  accounts: DerivedAccountKeys[];
  activeAccountIndex: number;
}

class BackgroundController {
  private client: QoreChainClient;
  private pendingRequests = new Map<string, PendingRequest>();
  private dAppPorts = new Map<string, chrome.runtime.Port>();
  private transferQuotes = new Map<string, QorTransferQuote>();
  private transferInProgress = false;
  private swapQuotes = new Map<string, AmmQuote>();
  private activityWrites: Promise<void> = Promise.resolve();
  private unlockedVault: VaultData | null = null;
  private autoLockTimeout: any = null;
  private unlockDeadline = 0;
  private vaultGeneration = 0;
  private vaultMutationInProgress = false;
  private approvalInProgress = false;
  private storageReady: Promise<void>;

  constructor() {
    this.storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    this.client = new QoreChainClient(QORECHAIN_CONFIG.rpcUrls[0]);
    this.setupPortListener();
    this.setupInternalMessageListener();
  }

  // --- Vault Lifecycle ---

  private async getEncryptedVault(): Promise<EncryptedVaultEnvelope | null> {
    const data = await chrome.storage.local.get(["encryptedVault"]);
    return data.encryptedVault || null;
  }

  private resetAutoLock() {
    if (this.autoLockTimeout) clearTimeout(this.autoLockTimeout);
    // Auto-lock after 15 minutes of inactivity
    this.unlockDeadline = Date.now() + 15 * 60 * 1000;
    this.autoLockTimeout = setTimeout(() => {
      this.lockVault();
    }, 15 * 60 * 1000);
  }

  public lockVault() {
    this.vaultGeneration++;
    this.unlockDeadline = 0;
    clearTimeout(this.autoLockTimeout);
    this.unlockedVault = null;
    this.transferQuotes.clear();
    this.swapQuotes.clear();
    for (const id of this.pendingRequests.keys()) this.rejectApproval(id, "Wallet locked");
    chrome.storage.session?.remove?.(["unlockedSession"]);
  }

  public async isInitialized(): Promise<boolean> {
    const vault = await this.getEncryptedVault();
    return vault !== null;
  }

  public isUnlocked(): boolean {
    if (this.unlockedVault && Date.now() >= this.unlockDeadline) this.lockVault();
    return this.unlockedVault !== null;
  }

  public getActiveAccount(): DerivedAccountKeys | null {
    if (!this.isUnlocked() || !this.unlockedVault) return null;
    return this.unlockedVault.accounts[this.unlockedVault.activeAccountIndex] || null;
  }

  public async createVault(mnemonic: string, password: string): Promise<DerivedAccountKeys> {
    if (await this.isInitialized()) throw new Error("A wallet already exists. Reset it explicitly before creating another.");
    if (typeof mnemonic !== "string" || !isValidMnemonic(mnemonic)) throw new Error("Invalid recovery phrase");
    if (typeof password !== "string" || password.length < 12 || password.length > 1024) throw new Error("Password must be between 12 and 1024 characters");
    const generation = this.vaultGeneration;
    const keys = deriveAccountKeys(mnemonic);
    const vaultData: VaultData = {
      mnemonic,
      accounts: [keys],
      activeAccountIndex: 0,
    };

    const envelope = await encryptVault(vaultData as any, password);
    if (generation !== this.vaultGeneration) throw new Error("Wallet state changed. Try again.");
    await chrome.storage.local.set({
      encryptedVault: envelope,
      activeAddress: keys.classicalAddress,
      cosmosAddress: keys.cosmosAddress,
      pqcPublicKeyHash: keys.pqcPublicKeyHash,
    });

    if (generation !== this.vaultGeneration) throw new Error("Wallet state changed. Try again.");
    this.unlockedVault = vaultData;
    this.resetAutoLock();
    return keys;
  }

  public async unlockVault(password: string): Promise<DerivedAccountKeys> {
    const generation = this.vaultGeneration;
    const envelope = await this.getEncryptedVault();
    if (!envelope) throw new Error("No vault found");

    const decrypted = (await decryptVault(envelope, password)) as unknown as VaultData;
    const accounts = decrypted.accounts.map(repairPqcPublicKeyHash);
    if (accounts.some((account, index) => account.pqcPublicKeyHash !== decrypted.accounts[index].pqcPublicKeyHash)) {
      decrypted.accounts = accounts;
      await chrome.storage.local.set({ encryptedVault: await encryptVault(decrypted as any, password) });
    }
    if (generation !== this.vaultGeneration) throw new Error("Wallet state changed. Try again.");
    this.unlockedVault = decrypted;
    this.resetAutoLock();

    const active = decrypted.accounts[decrypted.activeAccountIndex];
    await chrome.storage.local.set({
      activeAddress: active.classicalAddress,
      cosmosAddress: active.cosmosAddress,
      pqcPublicKeyHash: active.pqcPublicKeyHash,
    });
    return active;
  }

  // --- DApp Communication Bridge ---

  private setupPortListener() {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== "zeni-dapp-bridge") return;
      const sender = port.sender;
      let origin: string;
      try {
        const url = new URL(sender?.url || "");
        if (sender?.id !== chrome.runtime.id || sender.tab?.id === undefined || sender.frameId !== 0
          || !["https:", "http:"].includes(url.protocol) || sender.origin !== url.origin) throw new Error("Invalid sender");
        origin = url.origin;
      } catch { port.disconnect(); return; }
      const portKey = crypto.randomUUID();
      this.dAppPorts.set(portKey, port);

      port.onDisconnect.addListener(() => {
        this.dAppPorts.delete(portKey);
        for (const [id, request] of this.pendingRequests) {
          if (request.port === port) this.rejectApproval(id, "Page disconnected");
        }
      });

      port.onMessage.addListener(async (msg: { clientReqId: number; payload: { method: string; params?: any[] } }) => {
        try {
          await this.storageReady;
          if (!msg || !Number.isSafeInteger(msg.clientReqId) || !msg.payload
            || typeof msg.payload.method !== "string" || msg.payload.method.length > 100) {
            port.postMessage({ clientReqId: msg?.clientReqId, error: { code: -32600, message: "Invalid RPC request" } });
            return;
          }
          await this.handleDappRequest(port, msg.clientReqId, origin, msg.payload);
        } catch (err: any) {
          try { port.postMessage({
            clientReqId: msg?.clientReqId,
            error: { code: err?.code || -32603, message: err?.message || "Internal RPC Error" },
          }); } catch { /* Page disconnected. */ }
        }
      });
    });
  }

  private async handleDappRequest(
    port: chrome.runtime.Port,
    clientReqId: number,
    origin: string,
    payload: { method: string; params?: any[] }
  ) {
    switch (payload.method) {
      case "eth_chainId":
        port.postMessage({ clientReqId, result: "0x" + QORECHAIN_CONFIG.chainId.toString(16) });
        break;

      case "net_version":
        port.postMessage({ clientReqId, result: QORECHAIN_CONFIG.chainId.toString() });
        break;

      case "eth_accounts": {
        const active = this.getActiveAccount();
        const stored = await chrome.storage.local.get(["connectedOrigins", "activeAddress"]);
        const connectedOrigins = stored.connectedOrigins || [];

        if (active && connectedOrigins.includes(origin) && stored.activeAddress) {
          port.postMessage({ clientReqId, result: [stored.activeAddress] });
        } else {
          port.postMessage({ clientReqId, result: [] });
        }
        break;
      }

      case "eth_requestAccounts": {
        const stored = await chrome.storage.local.get(["connectedOrigins", "activeAddress"]);
        const connectedOrigins = stored.connectedOrigins || [];

        if (this.isUnlocked() && connectedOrigins.includes(origin) && stored.activeAddress) {
          port.postMessage({ clientReqId, result: [stored.activeAddress] });
          return;
        }

        // Queue connection approval request
        this.queueApproval(port, clientReqId, origin, payload);
        break;
      }

      case "eth_sendTransaction":
        port.postMessage({ clientReqId, error: { code: 4200, message: "Use zeni_sendQor for hybrid-signed native transfers. EVM sends are disabled." } });
        break;
      case "zeni_sendQor":
      case "personal_sign": {
        const active = this.getActiveAccount();
        const stored = await chrome.storage.local.get(["connectedOrigins"]);
        if (!active || !(stored.connectedOrigins || []).includes(origin)) {
          port.postMessage({ clientReqId, error: { code: 4100, message: "Unlock Zeni and connect this website before signing." } });
          return;
        }
        let intent: DappIntent;
        try {
          if (JSON.stringify(payload.params)?.length > 12000) throw new Error("Request parameters are too large.");
          intent = validateDappRequest(payload.method, payload.params, active.classicalAddress);
        } catch (error: any) {
          port.postMessage({ clientReqId, error: { code: -32602, message: error.message } });
          return;
        }
        if (this.getActiveAccount() !== active) throw new Error("Wallet changed. Connect again.");
        this.queueApproval(port, clientReqId, origin, payload, active.classicalAddress, intent);
        break;
      }

      default:
        port.postMessage({
          clientReqId,
          error: { code: 4200, message: `Method not supported: ${payload.method}` },
        });
    }
  }

  private queueApproval(
    port: chrome.runtime.Port,
    clientReqId: number,
    origin: string,
    payload: { method: string; params?: any[] },
    account?: string, intent?: DappIntent
  ) {
    this.expireApprovals();
    if (this.approvalInProgress || this.pendingRequests.size >= 5 || Array.from(this.pendingRequests.values()).some((r) => r.origin === origin)) {
      port.postMessage({ clientReqId, error: { code: -32002, message: "An approval is already pending. Open Zeni to review it." } });
      return;
    }
    const internalId = crypto.randomUUID();
    const req: PendingRequest = {
      internalId,
      clientReqId,
      origin,
      title: port.sender?.tab?.title,
      favIconUrl: port.sender?.tab?.favIconUrl,
      payload: { method: payload.method },
      account, intent,
      state: "PENDING",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      port,
    };

    this.pendingRequests.set(internalId, req);

    // Spawn popup window or badge notification
    chrome.action.setBadgeText({ text: String(this.pendingRequests.size) });
    chrome.action.setBadgeBackgroundColor({ color: "#9939FF" });

    // Review requests from the wallet toolbar; a page cannot spawn unlimited windows.
  }

  private rejectApproval(id: string, message: string) {
    const request = this.pendingRequests.get(id);
    this.pendingRequests.delete(id);
    try { request?.port?.postMessage({ clientReqId: request.clientReqId, error: { code: 4001, message } }); } catch { /* Disconnected. */ }
    chrome.action.setBadgeText({ text: this.pendingRequests.size ? String(this.pendingRequests.size) : "" });
  }

  private expireApprovals() {
    for (const [id, request] of this.pendingRequests) {
      if (request.expiresAt <= Date.now()) this.rejectApproval(id, "Request expired");
    }
  }

  private async writeActivity(change: (history: any[]) => any[]): Promise<void> {
    const work = this.activityWrites.then(async () => {
      const stored = await chrome.storage.local.get(["activityHistory"]);
      await chrome.storage.local.set({ activityHistory: change(stored.activityHistory || []) });
    });
    this.activityWrites = work.catch(() => {});
    return work;
  }

  private async saveNativeActivity(quote: AmmQuote, update: NativeTxUpdate, stage: "registration" | "swap") {
    const item = {
      hash: update.hash, type: stage === "swap" ? "SWAP" : "SETUP", nativeChain: true,
      account: quote.from, tokenIn: quote.tokenIn, tokenOut: quote.tokenOut,
      amountIn: quote.amountIn, minAmountOut: quote.minAmountOut,
      amountOut: stage === "swap" ? swapReceivedAmount(update.receipt, quote.from, quote.tokenOut) : undefined,
      poolId: quote.poolId, timestamp: Date.now(), status: update.status,
      gasCost: `${ethers.formatUnits(update.feeUqor, 6)} QOR`,
      explorerUrl: transactionExplorerUrl(update.hash), error: update.error,
    };
    await this.writeActivity((history) => {
      const previous = history.find((entry) => entry.hash === item.hash);
      return [{ ...item, timestamp: previous?.timestamp || item.timestamp }, ...history.filter((entry) => entry.hash !== item.hash)].slice(0, 100);
    });
  }

  private async reconcileNativeActivity() {
    const stored = await chrome.storage.local.get(["activityHistory"]);
    const pending = (stored.activityHistory || []).filter((item: any) => (item.nativeChain || item.evmChain) && item.status === "PENDING");
    const client = new AmmSwapClient(this.client.provider);
    for (const item of pending) {
      try {
        if (item.evmChain) {
          const receipt = await this.client.provider.getTransactionReceipt(item.hash);
          if (!receipt || receipt.status === null) continue;
          await this.writeActivity((history) => history.map((entry) => entry.hash === item.hash ? {
            ...entry, status: receipt.status === 1 ? "CONFIRMED" : "FAILED",
            gasCost: `${formatEther(receipt.fee)} QOR`,
          } : entry));
          continue;
        }
        const receipt = await client.receipt(item.hash);
        if (!receipt || receipt.code === undefined || BigInt(receipt.height || "0") <= 0n) continue;
        await this.writeActivity((history) => history.map((entry) => entry.hash === item.hash ? {
          ...entry, status: Number(receipt.code) === 0 ? "CONFIRMED" : "FAILED",
          amountOut: item.type === "SWAP" ? swapReceivedAmount(receipt, item.account, item.tokenOut) : undefined,
          error: Number(receipt.code) === 0 ? undefined : receipt.raw_log,
        } : entry));
      } catch { /* Keep uncertain transactions pending; never turn lookup errors into success. */ }
    }
  }

  private async assertNoPendingNative(active: DerivedAccountKeys) {
    await this.reconcileNativeActivity();
    const stored = await chrome.storage.local.get(["activityHistory"]);
    if ((stored.activityHistory || []).some((item: any) => (item.nativeChain || item.evmChain) && item.account === active.cosmosAddress && item.status === "PENDING")) {
      throw new Error("A previous transaction is still pending. Check its explorer link in Activity before sending another.");
    }
  }

  // --- Internal Message Handler for UI ---

  private setupInternalMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Only extension pages may invoke private vault/transfer messages.
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) {
        sendResponse({ success: false, error: "Unauthorized wallet request" });
        return false;
      }
      this.storageReady.then(() => this.handleInternalMessage(message))
        .then((res) => sendResponse({ success: true, data: res }))
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
      return true; // Keep message channel open for async response
    });
  }

  private async handleInternalMessage(message: any, assertApproval: () => void = () => {}): Promise<any> {
    if (!message || typeof message.type !== "string") throw new Error("Invalid wallet request");
    switch (message.type) {
      case "GET_SESSION_STATUS": {
        // Route the popup from local vault state without waiting for network balances.
        const stored = await chrome.storage.local.get([
          "encryptedVault", "activeAddress", "cosmosAddress", "pqcPublicKeyHash",
        ]);
        const active = this.getActiveAccount();
        return {
          isInitialized: !!stored.encryptedVault,
          isUnlocked: this.isUnlocked(),
          activeAddress: active?.classicalAddress || stored.activeAddress || null,
          cosmosAddress: active?.cosmosAddress || stored.cosmosAddress || null,
          pqcPublicKeyHash: active?.pqcPublicKeyHash || stored.pqcPublicKeyHash || null,
        };
      }

      case "GET_STATUS": {
        const initialized = await this.isInitialized();
        const unlocked = this.isUnlocked();
        const active = this.getActiveAccount();
        const stored = await chrome.storage.local.get([
          "activeAddress",
          "cosmosAddress",
          "pqcPublicKeyHash",
          "tokenBalances",
        ]);

        const currentAddress =
          active?.classicalAddress ||
          stored.activeAddress ||
          active?.cosmosAddress ||
          stored.cosmosAddress ||
          null;
        const address = active?.cosmosAddress || stored.cosmosAddress
          || (currentAddress ? evmToBech32Address(currentAddress) : null);
        const balances = address
          ? await new AmmSwapClient(this.client.provider).balances(address)
          : { QOR: "0", fUSD: "0", fETH: "0", fBTC: "0" };
        const onChainBalance = balances.QOR;
        const savedTokenBalances = { fUSD: balances.fUSD, fETH: balances.fETH, fBTC: balances.fBTC };

        return {
          isInitialized: initialized,
          isUnlocked: unlocked,
          activeAddress: currentAddress,
          cosmosAddress: active?.cosmosAddress || stored.cosmosAddress || null,
          pqcPublicKeyHash: active?.pqcPublicKeyHash || stored.pqcPublicKeyHash || null,
          onChainBalance,
          tokenBalances: savedTokenBalances,
        };
      }

      case "GET_BALANCE": {
        const active = this.getActiveAccount();
        const stored = await chrome.storage.local.get(["activeAddress", "cosmosAddress"]);
        const target =
          message.address ||
          active?.classicalAddress ||
          stored.activeAddress ||
          active?.cosmosAddress ||
          stored.cosmosAddress;
        if (!target) return { balance: "0.0000" };
        try {
          const bal = await this.client.getNativeBalance(target);
          return { balance: formatEther(bal) };
        } catch (e: any) {
          return { balance: "0.0000", error: e?.message };
        }
      }

      case "CREATE_VAULT": {
        if (this.vaultMutationInProgress) throw new Error("Wallet update already in progress");
        this.vaultMutationInProgress = true;
        try { await this.createVault(message.mnemonic, message.password); return true; }
        finally { this.vaultMutationInProgress = false; }
      }

      case "UNLOCK_VAULT": {
        if (this.vaultMutationInProgress) throw new Error("Wallet update already in progress");
        this.vaultMutationInProgress = true;
        try { await this.unlockVault(message.password); return true; }
        finally { this.vaultMutationInProgress = false; }
      }

      case "LOCK_VAULT": {
        this.lockVault();
        return true;
      }

      case "RESET_WALLET": {
        if (this.vaultMutationInProgress || this.transferInProgress || this.approvalInProgress) throw new Error("Wait for the current wallet operation before resetting");
        this.lockVault();
        await chrome.storage.local.clear();
        return true;
      }

      case "EXPORT_MNEMONIC": {
        if (!this.isUnlocked()) throw new Error("Wallet is locked");
        const generation = this.vaultGeneration;
        const envelope = await this.getEncryptedVault();
        if (!envelope) throw new Error("No vault found");
        // Verify password
        const decrypted = (await decryptVault(envelope, message.password)) as unknown as VaultData;
        if (generation !== this.vaultGeneration || !this.isUnlocked()) throw new Error("Wallet is locked");
        return decrypted.mnemonic;
      }

      case "GET_PENDING_APPROVALS": {
        this.expireApprovals();
        return Array.from(this.pendingRequests.values()).map((r) => ({
          internalId: r.internalId,
          origin: r.origin,
          title: r.title,
          favIconUrl: r.favIconUrl,
          payload: r.payload,
          account: r.account, intent: r.intent,
          createdAt: r.createdAt,
        }));
      }

      case "PREPARE_DAPP_APPROVAL": {
        this.expireApprovals();
        const pending = this.pendingRequests.get(message.internalId);
        const active = this.getActiveAccount();
        if (!pending || pending.intent?.kind !== "transfer" || !active || active.classicalAddress !== pending.account) throw new Error("Request expired or account changed.");
        if (this.transferInProgress || this.approvalInProgress) throw new Error("Wait for the current wallet operation.");
        const version = pending.quoteVersion = (pending.quoteVersion || 0) + 1;
        pending.quote = undefined;
        const quote = await new QorTransferClient(this.client.provider).prepare(active, pending.intent.to, pending.intent.amount);
        if (pending.quoteVersion !== version) throw new Error("A newer fee review replaced this request.");
        if (this.getActiveAccount() !== active || this.pendingRequests.get(pending.internalId) !== pending || pending.expiresAt <= Date.now()) throw new Error("Request expired or wallet changed.");
        pending.quote = quote;
        return quote;
      }

      case "RESOLVE_APPROVAL": {
        if (this.approvalInProgress) throw new Error("An approval is already being resolved");
        this.expireApprovals();
        const { internalId, approved } = message;
        const pending = this.pendingRequests.get(internalId);
        if (!pending) throw new Error("Request not found or expired");
        if (typeof approved !== "boolean") throw new Error("Invalid approval decision");
        const active = this.getActiveAccount();
        if (approved && !active) throw new Error("Unlock the wallet before approving");

        if (approved && pending.intent) {
          if (active!.classicalAddress !== pending.account) throw new Error("Account changed. Reject this request and reconnect.");
          if (pending.intent.kind === "transfer" && (!pending.quote || pending.quote.id !== message.quoteId || pending.quote.expiresAt <= Date.now())) throw new Error("Review a fresh fee quote before approving.");
        }
        this.pendingRequests.delete(internalId);
        chrome.action.setBadgeText({
          text: this.pendingRequests.size > 0 ? String(this.pendingRequests.size) : "",
        });

        if (!approved) {
          pending.port?.postMessage({
            clientReqId: pending.clientReqId,
            error: { code: 4001, message: "User rejected request" },
          });
          return { resolved: true };
        }

        if (pending.intent) {
          this.approvalInProgress = true;
          const generation = this.vaultGeneration;
          const assertCurrent = () => {
            if (generation !== this.vaultGeneration || this.getActiveAccount() !== active || pending.expiresAt <= Date.now()
              || !Array.from(this.dAppPorts.values()).includes(pending.port!)) throw new Error("Wallet locked, page disconnected, or request expired. Check Activity before retrying.");
          };
          try {
            assertCurrent();
            this.resetAutoLock();
            let result: string;
            if (pending.intent.kind === "message") {
              result = await new ethers.Wallet(active!.classicalPrivateKey).signMessage(ethers.getBytes(pending.intent.hex));
              assertCurrent();
            } else {
              const quote = pending.quote!;
              this.transferQuotes.set(quote.id, quote);
              result = (await this.handleInternalMessage({ type: "EXECUTE_TRANSFER", token: "QOR", to: pending.intent.to, amount: pending.intent.amount, quoteId: quote.id }, assertCurrent)).txHash;
            }
            try { pending.port?.postMessage({ clientReqId: pending.clientReqId, result }); } catch { /* Broadcast may have completed after navigation; Activity keeps the hash. */ }
            return { resolved: true };
          } catch (error: any) {
            try { pending.port?.postMessage({ clientReqId: pending.clientReqId, error: { code: -32603, message: error.message } }); } catch { /* Disconnected. */ }
            throw error;
          } finally { this.approvalInProgress = false; }
        }

        // Handle approved connection request
        if (pending.payload.method === "eth_requestAccounts") {
          this.approvalInProgress = true;
          try {
            const stored = await chrome.storage.local.get(["connectedOrigins", "activeAddress"]);
            if (this.getActiveAccount() !== active || !Array.from(this.dAppPorts.values()).includes(pending.port!)) {
              pending.port?.postMessage({ clientReqId: pending.clientReqId, error: { code: 4001, message: "Wallet or page changed. Request a new connection." } });
              throw new Error("Wallet or page changed");
            }
            const origins = new Set(stored.connectedOrigins || []);
            origins.add(pending.origin);
            await chrome.storage.local.set({ connectedOrigins: Array.from(origins) });

            pending.port?.postMessage({
              clientReqId: pending.clientReqId,
              result: [active!.classicalAddress],
            });
          } finally { this.approvalInProgress = false; }
        }

        return { resolved: true };
      }

      case "PREPARE_QOR_TRANSFER": {
        const active = this.getActiveAccount();
        if (!active) throw new Error("Wallet is locked");
        if (this.transferInProgress) throw new Error("A transfer is already in progress.");
        const quote = await new QorTransferClient(this.client.provider).prepare(active, message.to, message.amount);
        if (this.getActiveAccount() !== active) throw new Error("Wallet locked or account changed. Review again.");
        this.transferQuotes.clear();
        this.transferQuotes.set(quote.id, quote);
        return quote;
      }

      case "EXECUTE_TRANSFER": {
        assertApproval();
        // Broadcasts token transfer to QoreChain Testnet
        const { to, amount, token } = message;
        if (token !== "QOR") throw new Error("Only QOR transfers are supported in this release.");
        const active = this.getActiveAccount();
        if (!active) throw new Error("Wallet is locked");

        let target = (to || "").trim();
        if (target.startsWith("qor1") || target.startsWith("cosmos1")) {
          target = bech32ToEvmAddress(target);
        }

        try {
          target = ethers.getAddress(target);
        } catch {
          throw new Error("Invalid recipient address format. Must be a valid 0x or qor1 address.");
        }

        let txHash: string;

        {
          try {
            const quote = this.transferQuotes.get(message.quoteId);
            if (!quote || quote.to !== target || quote.value !== parseEther(amount.toString()).toString()) {
              throw new Error("Review the native QOR transfer and its fee limits before confirming.");
            }
            if (this.transferInProgress) throw new Error("A transfer is already in progress.");
            this.transferQuotes.delete(quote.id);
            this.transferInProgress = true;
            this.resetAutoLock();
            try {
              await this.assertNoPendingNative(active);
              txHash = await new QorTransferClient(this.client.provider).send(active, quote, () => {
                assertApproval();
                if (this.getActiveAccount() !== active) throw new Error("Wallet locked or account changed. Review the transfer again.");
              }, async (update) => {
                await this.writeActivity((history) => [{
                  hash: update.hash, type: "SETUP", nativeChain: true, account: active.cosmosAddress,
                  timestamp: history.find((item) => item.hash === update.hash)?.timestamp || Date.now(),
                  status: update.status, gasCost: `${ethers.formatUnits(update.feeUqor, 6)} QOR`, error: update.error,
                }, ...history.filter((item) => item.hash !== update.hash)]);
              }, async (update) => {
                const hash = update.hash;
                await this.writeActivity((history) => [{
                  hash, type: "SEND", nativeChain: true, account: active.cosmosAddress, to: quote.to,
                  amount: quote.amount, token: "QOR", timestamp: history.find(item => item.hash === hash)?.timestamp || Date.now(), status: update.status,
                  gasCost: `${ethers.formatUnits(update.feeUqor, 6)} QOR`, error: update.error,
                }, ...history.filter(item => item.hash !== hash)]);
              });
            } finally {
              this.transferInProgress = false;
            }
          } catch (err: any) {
            // Robust extraction of RPC errors to prevent generic "could not coalesce error"
            let errMsg = err?.error?.message || err?.info?.error?.message || "";
            if (!errMsg && typeof err?.message === "string") {
              const jsonMatch = err.message.match(/error=\s*({.*?})/);
              if (jsonMatch) {
                try {
                  const parsed = JSON.parse(jsonMatch[1]);
                  if (parsed?.message) errMsg = parsed.message;
                } catch {}
              }
            }
            if (!errMsg) {
              if (err?.shortMessage && err.shortMessage !== "could not coalesce error") {
                errMsg = err.shortMessage;
              } else if (err?.reason) {
                errMsg = err.reason;
              } else if (err?.message && !err.message.includes("could not coalesce error")) {
                errMsg = err.message;
              }
            }

            if (
              errMsg.includes("has no usable registered post-quantum key")
            ) {
              errMsg = "QoreChain rejected the registered post-quantum key. Check key registration before retrying. Completed setup transactions may have charged fees.";
            } else if (
              errMsg.includes("sender balance < tx cost") ||
              errMsg.includes("insufficient balance") ||
              errMsg.includes("insufficient funds")
            ) {
              errMsg = "Insufficient QOR balance to cover transfer amount and network gas fee.";
            } else if (errMsg.includes("nonce")) {
              errMsg = "Transaction nonce conflict. Please try again.";
            } else if (errMsg) {
              errMsg = errMsg.replace(/\s*\[.*?:[0-9]+\]/g, "").trim();
            }

            throw new Error(errMsg || "Transaction failed to broadcast to QoreChain");
          }
        }

        return { txHash };
      }

      case "CLEAR_ACTIVITY": {
        await this.writeActivity((history) => history.filter((item: any) => (item.nativeChain || item.evmChain) && item.status === "PENDING"));
        return true;
      }

      case "PREPARE_SWAP": {
        const active = this.getActiveAccount();
        if (!active) throw new Error("Wallet is locked");
        if (this.transferInProgress) throw new Error("A transaction is already in progress.");
        await this.assertNoPendingNative(active);
        const quote = await new AmmSwapClient(this.client.provider).prepareSwap(active, message.tokenIn, message.tokenOut, message.amountIn, message.slippageBps);
        if (this.getActiveAccount() !== active) throw new Error("Wallet locked or account changed.");
        for (const [id, old] of this.swapQuotes) if (old.expiresAt < Date.now()) this.swapQuotes.delete(id);
        if (this.swapQuotes.size >= 20) this.swapQuotes.delete(this.swapQuotes.keys().next().value!);
        this.swapQuotes.set(quote.id, quote);
        return quote;
      }

      case "EXECUTE_SWAP": {
        const active = this.getActiveAccount();
        if (!active) throw new Error("Wallet is locked");
        if (this.transferInProgress) throw new Error("A transaction is already in progress.");
        const quote = this.swapQuotes.get(message.quoteId);
        if (!quote || quote.from !== active.cosmosAddress) throw new Error("Review a fresh swap quote before confirming.");
        this.swapQuotes.delete(quote.id);
        this.transferInProgress = true;
        this.resetAutoLock();
        let stage: "registration" | "swap" = "swap";
        try {
          await this.assertNoPendingNative(active);
          return await new AmmSwapClient(this.client.provider).executeSwap(active, quote, () => {
            if (this.getActiveAccount() !== active) throw new Error("Wallet locked or account changed.");
          }, async (update, currentStage) => {
            stage = currentStage;
            await this.saveNativeActivity(quote, update, currentStage);
          });
        } catch (error) {
          if (error instanceof NativeTxError) return {
            hash: error.update.hash, status: error.update.status, stage,
            explorerUrl: transactionExplorerUrl(error.update.hash), error: error.message,
          };
          throw error;
        } finally { this.transferInProgress = false; }
      }

      case "GET_ACTIVITY": {
        await this.reconcileNativeActivity();
        const historyData = await chrome.storage.local.get(["activityHistory"]);
        return historyData.activityHistory || [];
      }

      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }
}

// Instantiate controller
new BackgroundController();

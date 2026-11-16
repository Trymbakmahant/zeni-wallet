import {
  QORECHAIN_CONFIG,
  QoreChainClient,
  DerivedAccountKeys,
  EncryptedVaultEnvelope,
  deriveAccountKeys,
  repairPqcPublicKeyHash,
  QorTransferClient,
  QorTransferQuote,
  bech32ToEvmAddress,
  encryptVault,
  decryptVault,
  encodeAccountExecute,
  getUserOperationHash,
  encodeHybridSignature,
} from "@zeni/core";
import { ethers, formatEther, parseEther } from "ethers";

interface PendingRequest {
  internalId: string;
  clientReqId: number;
  origin: string;
  title?: string;
  favIconUrl?: string;
  payload: { method: string; params?: any[] };
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
  private unlockedVault: VaultData | null = null;
  private autoLockTimeout: any = null;

  constructor() {
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
    this.autoLockTimeout = setTimeout(() => {
      this.lockVault();
    }, 15 * 60 * 1000);
  }

  public lockVault() {
    this.unlockedVault = null;
    this.transferQuotes.clear();
    chrome.storage.session?.remove?.(["unlockedSession"]);
  }

  public async isInitialized(): Promise<boolean> {
    const vault = await this.getEncryptedVault();
    return vault !== null;
  }

  public isUnlocked(): boolean {
    return this.unlockedVault !== null;
  }

  public getActiveAccount(): DerivedAccountKeys | null {
    if (!this.unlockedVault) return null;
    return this.unlockedVault.accounts[this.unlockedVault.activeAccountIndex] || null;
  }

  public async createVault(mnemonic: string, password: string): Promise<DerivedAccountKeys> {
    const keys = deriveAccountKeys(mnemonic);
    const vaultData: VaultData = {
      mnemonic,
      accounts: [keys],
      activeAccountIndex: 0,
    };

    const envelope = await encryptVault(vaultData as any, password);
    await chrome.storage.local.set({
      encryptedVault: envelope,
      activeAddress: keys.classicalAddress,
      cosmosAddress: keys.cosmosAddress,
      pqcPublicKeyHash: keys.pqcPublicKeyHash,
    });

    this.unlockedVault = vaultData;
    this.resetAutoLock();
    return keys;
  }

  public async unlockVault(password: string): Promise<DerivedAccountKeys> {
    const envelope = await this.getEncryptedVault();
    if (!envelope) throw new Error("No vault found");

    const decrypted = (await decryptVault(envelope, password)) as unknown as VaultData;
    const accounts = decrypted.accounts.map(repairPqcPublicKeyHash);
    if (accounts.some((account, index) => account.pqcPublicKeyHash !== decrypted.accounts[index].pqcPublicKeyHash)) {
      decrypted.accounts = accounts;
      await chrome.storage.local.set({ encryptedVault: await encryptVault(decrypted as any, password) });
    }
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

      const origin = port.sender?.origin || "unknown";
      const tabId = port.sender?.tab?.id;
      const portKey = `${origin}-${tabId || "popup"}-${Date.now()}`;
      this.dAppPorts.set(portKey, port);

      port.onDisconnect.addListener(() => {
        this.dAppPorts.delete(portKey);
      });

      port.onMessage.addListener(async (msg: { clientReqId: number; payload: { method: string; params?: any[] } }) => {
        const { clientReqId, payload } = msg;

        try {
          await this.handleDappRequest(port, clientReqId, origin, payload);
        } catch (err: any) {
          port.postMessage({
            clientReqId,
            error: { code: -32603, message: err?.message || "Internal RPC Error" },
          });
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

        if (connectedOrigins.includes(origin) && stored.activeAddress) {
          port.postMessage({ clientReqId, result: [stored.activeAddress] });
        } else {
          port.postMessage({ clientReqId, result: [] });
        }
        break;
      }

      case "eth_requestAccounts": {
        const stored = await chrome.storage.local.get(["connectedOrigins", "activeAddress"]);
        const connectedOrigins = stored.connectedOrigins || [];

        if (connectedOrigins.includes(origin) && stored.activeAddress) {
          port.postMessage({ clientReqId, result: [stored.activeAddress] });
          return;
        }

        // Queue connection approval request
        this.queueApproval(port, clientReqId, origin, payload);
        break;
      }

      case "eth_sendTransaction":
      case "personal_sign":
      case "eth_signTypedData_v4":
        this.queueApproval(port, clientReqId, origin, payload);
        break;

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
    payload: { method: string; params?: any[] }
  ) {
    const internalId = crypto.randomUUID();
    const req: PendingRequest = {
      internalId,
      clientReqId,
      origin,
      title: port.sender?.tab?.title,
      favIconUrl: port.sender?.tab?.favIconUrl,
      payload,
      state: "PENDING",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      port,
    };

    this.pendingRequests.set(internalId, req);

    // Spawn popup window or badge notification
    chrome.action.setBadgeText({ text: String(this.pendingRequests.size) });
    chrome.action.setBadgeBackgroundColor({ color: "#9939FF" });

    chrome.windows.create({
      url: `index.html?approvalId=${internalId}`,
      type: "popup",
      width: 360,
      height: 600,
      focused: true,
    });
  }

  // --- Internal Message Handler for UI ---

  private setupInternalMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Only extension pages may invoke private vault/transfer messages.
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) {
        sendResponse({ success: false, error: "Unauthorized wallet request" });
        return false;
      }
      this.handleInternalMessage(message)
        .then((res) => sendResponse({ success: true, data: res }))
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
      return true; // Keep message channel open for async response
    });
  }

  private async handleInternalMessage(message: any): Promise<any> {
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
        let onChainBalance = "0.0000";

        if (currentAddress) {
          try {
            const bal = await this.client.getNativeBalance(currentAddress);
            onChainBalance = formatEther(bal);
          } catch (e) {
            console.warn("Could not query live RPC balance:", e);
          }
        }

        // Secondary token balances start strictly at 0 until funded/swapped
        const savedTokenBalances = stored.tokenBalances || {
          fUSD: "0.00",
          fETH: "0.0000",
          fBTC: "0.0000",
        };

        // Query on-chain ERC20 contracts if deployed
        if (currentAddress) {
          try {
            const fusdRaw = await this.client.getTokenBalance(QORECHAIN_CONFIG.contracts.fUSD, currentAddress);
            if (fusdRaw > 0n) {
              savedTokenBalances.fUSD = formatEther(fusdRaw);
            }
          } catch {}
          try {
            const fethRaw = await this.client.getTokenBalance(QORECHAIN_CONFIG.contracts.fETH, currentAddress);
            if (fethRaw > 0n) {
              savedTokenBalances.fETH = formatEther(fethRaw);
            }
          } catch {}
          try {
            const fbtcRaw = await this.client.getTokenBalance(QORECHAIN_CONFIG.contracts.fBTC, currentAddress);
            if (fbtcRaw > 0n) {
              savedTokenBalances.fBTC = (Number(fbtcRaw) / 1e8).toFixed(4);
            }
          } catch {}
        }

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
        return this.createVault(message.mnemonic, message.password);
      }

      case "UNLOCK_VAULT": {
        return this.unlockVault(message.password);
      }

      case "LOCK_VAULT": {
        this.lockVault();
        return true;
      }

      case "RESET_WALLET": {
        this.lockVault();
        await chrome.storage.local.clear();
        return true;
      }

      case "EXPORT_MNEMONIC": {
        if (!this.unlockedVault) throw new Error("Wallet is locked");
        const envelope = await this.getEncryptedVault();
        if (!envelope) throw new Error("No vault found");
        // Verify password
        const decrypted = (await decryptVault(envelope, message.password)) as unknown as VaultData;
        return decrypted.mnemonic;
      }

      case "GET_PENDING_APPROVALS": {
        return Array.from(this.pendingRequests.values()).map((r) => ({
          internalId: r.internalId,
          origin: r.origin,
          title: r.title,
          favIconUrl: r.favIconUrl,
          payload: r.payload,
          createdAt: r.createdAt,
        }));
      }

      case "RESOLVE_APPROVAL": {
        const { internalId, approved } = message;
        const pending = this.pendingRequests.get(internalId);
        if (!pending) throw new Error("Request not found or expired");

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

        // Handle approved request
        if (pending.payload.method === "eth_requestAccounts") {
          const stored = await chrome.storage.local.get(["connectedOrigins", "activeAddress"]);
          const origins = new Set(stored.connectedOrigins || []);
          origins.add(pending.origin);
          await chrome.storage.local.set({ connectedOrigins: Array.from(origins) });

          pending.port?.postMessage({
            clientReqId: pending.clientReqId,
            result: [stored.activeAddress],
          });
        } else if (pending.payload.method === "eth_sendTransaction") {
          // Return simulated transaction hash
          const mockTx = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
          pending.port?.postMessage({
            clientReqId: pending.clientReqId,
            result: mockTx,
          });
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
        // Broadcasts token transfer to QoreChain Testnet
        const { to, amount, token } = message;
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
        let gasCostDisplay = "~0.0030 QOR";

        if (token === "QOR") {
          try {
            const quote = this.transferQuotes.get(message.quoteId);
            if (!quote || quote.to !== target || quote.value !== parseEther(amount.toString()).toString()) {
              throw new Error("Review the QOR transfer and its authorization limits before confirming.");
            }
            if (this.transferInProgress) throw new Error("A transfer is already in progress.");
            this.transferQuotes.delete(quote.id);
            this.transferInProgress = true;
            this.resetAutoLock();
            try {
              txHash = await new QorTransferClient(this.client.provider).send(active, quote, () => {
                if (this.getActiveAccount() !== active) throw new Error("Wallet locked or account changed. Review the transfer again.");
              });
              gasCostDisplay = `Up to ${quote.maxNetworkFee} QOR (including setup)`;
            } finally {
              this.transferInProgress = false;
            }
          } catch (err: any) {
            console.error("Live on-chain QOR transfer failed:", err);
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
              errMsg.includes("has no usable registered post-quantum key") ||
              errMsg.includes("no open EVM authorisation window") ||
              errMsg.includes("no open EVM authorization window")
            ) {
              errMsg = "QoreChain rejected the transfer authorization. Review the transfer again to open a fresh window. Completed setup transactions may have charged fees.";
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
        } else {
          // Fallback simulation for offline/unfunded testnet demo tokens
          txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
          const stored = await chrome.storage.local.get(["tokenBalances"]);
          const balances = stored.tokenBalances || {
            fUSD: "0.00",
            fETH: "0.0000",
            fBTC: "0.0000",
          };
          const current = parseFloat(balances[token] || "0");
          const dec = token === "fUSD" ? 2 : 4;
          balances[token] = Math.max(0, current - (parseFloat(amount) || 0)).toFixed(dec);
          await chrome.storage.local.set({ tokenBalances: balances });
          gasCostDisplay = "~0.0030 QOR";
        }

        // Store in activity history
        const historyData = await chrome.storage.local.get(["activityHistory"]);
        const history = historyData.activityHistory || [];
        history.unshift({
          hash: txHash,
          type: "SEND",
          to,
          amount,
          token,
          timestamp: Date.now(),
          status: "CONFIRMED",
          gasCost: gasCostDisplay,
        });
        await chrome.storage.local.set({ activityHistory: history.slice(0, 50) });

        return { txHash };
      }

      case "CLEAR_ACTIVITY": {
        await chrome.storage.local.set({ activityHistory: [] });
        return true;
      }

      case "EXECUTE_SWAP": {
        const { tokenIn, tokenOut, amountIn, amountOut } = message;
        const active = this.getActiveAccount();
        if (!active) throw new Error("Wallet is locked");

        const txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

        // Update stored token balances reflecting the swap
        const stored = await chrome.storage.local.get(["tokenBalances"]);
        const balances = stored.tokenBalances || {
          fUSD: "0.00",
          fETH: "0.0000",
          fBTC: "0.0000",
        };
        const inVal = parseFloat(amountIn) || 0;
        const outVal = parseFloat(amountOut) || 0;

        if (tokenIn !== "QOR") {
          const currentIn = parseFloat(balances[tokenIn] || "0");
          const decIn = tokenIn === "fUSD" ? 2 : 4;
          balances[tokenIn] = Math.max(0, currentIn - inVal).toFixed(decIn);
        }
        if (tokenOut !== "QOR") {
          const currentOut = parseFloat(balances[tokenOut] || "0");
          const decOut = tokenOut === "fUSD" ? 2 : 4;
          balances[tokenOut] = (currentOut + outVal).toFixed(decOut);
        }
        await chrome.storage.local.set({ tokenBalances: balances });

        const historyData = await chrome.storage.local.get(["activityHistory"]);
        const history = historyData.activityHistory || [];
        history.unshift({
          hash: txHash,
          type: "SWAP",
          tokenIn,
          tokenOut,
          amountIn,
          amountOut,
          timestamp: Date.now(),
          status: "CONFIRMED",
          gasCost: "~0.0030 QOR",
        });
        await chrome.storage.local.set({ activityHistory: history.slice(0, 50) });

        return { txHash, tokenBalances: balances };
      }

      case "GET_ACTIVITY": {
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

/**
 * Zeni Inpage Provider (EIP-1193 + EIP-6963)
 * Injected into website context. Has zero access to secrets or extension storage.
 */

interface RequestArguments {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

class ZeniInpageProvider {
  private requestId = 0;
  private pendingCallbacks = new Map<number, { resolve: (val: unknown) => void; reject: (err: Error) => void }>();

  private accountListeners = new Set<(accounts: string[]) => void>();
  public on(event: string, listener: (accounts: string[]) => void) {
    if (event === "accountsChanged" && typeof listener === "function") this.accountListeners.add(listener);
    return this;
  }
  public removeListener(event: string, listener: (accounts: string[]) => void) {
    if (event === "accountsChanged") this.accountListeners.delete(listener);
    return this;
  }

  public isZeni = true;
  public isMetaMask = false;

  constructor() {
    window.addEventListener("message", this.handleMessage.bind(this));
    this.announceEIP6963();
  }

  private handleMessage(event: MessageEvent) {
    if (event.source !== window || event.origin !== window.location.origin || !event.data || event.data.target !== "zeni-inpage-response") {
      return;
    }

    if (event.data.event === "accountsChanged") {
      const accounts = event.data.accounts;
      if (!Array.isArray(accounts) || accounts.length > 1 || !accounts.every((address: unknown) => typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address))) return;
      for (const listener of this.accountListeners) {
        try { listener([...accounts]); } catch { /* One dApp listener must not block another. */ }
      }
      return;
    }
    const { clientReqId, result, error } = event.data;
    const pending = this.pendingCallbacks.get(clientReqId);
    if (!pending) return;

    this.pendingCallbacks.delete(clientReqId);
    if (error) {
      pending.reject(Object.assign(new Error(error.message || "RPC request rejected"), { code: error.code }));
    } else {
      pending.resolve(result);
    }
  }

  public async request(args: RequestArguments): Promise<unknown> {
    if (!args || typeof args.method !== "string" || args.method.length > 100) {
      throw Object.assign(new Error("Invalid wallet request"), { code: -32600 });
    }
    const clientReqId = ++this.requestId;

    return new Promise((resolve, reject) => {
      if (this.pendingCallbacks.size >= 100) {
        reject(Object.assign(new Error("Too many pending wallet requests"), { code: -32002 }));
        return;
      }
      const timeout = setTimeout(() => {
        this.pendingCallbacks.delete(clientReqId);
        reject(Object.assign(new Error("Wallet request timed out. Open Zeni and try again."), { code: 4001 }));
      }, 5 * 60 * 1000);
      this.pendingCallbacks.set(clientReqId, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });

      window.postMessage(
        {
          target: "zeni-content-bridge",
          clientReqId,
          payload: args,
        },
        window.location.origin
      );
    });
  }

  private announceEIP6963() {
    const info = {
      uuid: "47b9f899-7928-4efc-8b83-6d125f5de001",
      name: "Zeni Wallet",
      icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%239939FF'/><text x='50' y='65' font-size='45' text-anchor='middle' fill='white'>銭</text></svg>",
      rdns: "io.qorechain.zeni",
    };

    const detail = Object.freeze({ info, provider: this });
    const announceEvent = new CustomEvent("eip6963:announceProvider", { detail });

    window.dispatchEvent(announceEvent);
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(announceEvent);
    });
  }
}

// Attach provider to window.ethereum and window.zeni
const zeniProvider = new ZeniInpageProvider();
(window as unknown as Record<string, unknown>).zeni = zeniProvider;
if (!(window as unknown as Record<string, unknown>).ethereum) {
  (window as unknown as Record<string, unknown>).ethereum = zeniProvider;
}

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

  public isZeni = true;
  public isMetaMask = false;

  constructor() {
    window.addEventListener("message", this.handleMessage.bind(this));
    this.announceEIP6963();
  }

  private handleMessage(event: MessageEvent) {
    if (event.source !== window || !event.data || event.data.target !== "zeni-inpage-response") {
      return;
    }

    const { clientReqId, result, error } = event.data;
    const pending = this.pendingCallbacks.get(clientReqId);
    if (!pending) return;

    this.pendingCallbacks.delete(clientReqId);
    if (error) {
      pending.reject(new Error(error.message || "RPC request rejected"));
    } else {
      pending.resolve(result);
    }
  }

  public async request(args: RequestArguments): Promise<unknown> {
    const clientReqId = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingCallbacks.set(clientReqId, { resolve, reject });

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
      uuid: "47b9f899-7928-4efc-8b83-zeni-wallet-001",
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

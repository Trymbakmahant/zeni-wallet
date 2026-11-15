import { QORECHAIN_CONFIG, QoreChainClient, UserOperationData } from "@zeni/core";

interface PendingRequest {
  internalId: string;
  clientReqId: number;
  origin: string;
  payload: { method: string; params?: unknown[] };
  port: chrome.runtime.Port;
}

const client = new QoreChainClient(QORECHAIN_CONFIG.rpcUrls[0]);
const pendingRequests = new Map<string, PendingRequest>();

// Handle connections from content scripts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "zeni-dapp-bridge") return;

  const origin = port.sender?.origin || "unknown";

  port.onMessage.addListener(async (msg: { clientReqId: number; payload: { method: string; params?: unknown[] } }) => {
    const { clientReqId, payload } = msg;

    try {
      switch (payload.method) {
        case "eth_chainId":
          port.postMessage({ clientReqId, result: "0x" + QORECHAIN_CONFIG.chainId.toString(16) });
          break;

        case "net_version":
          port.postMessage({ clientReqId, result: QORECHAIN_CONFIG.chainId.toString() });
          break;

        case "eth_accounts": {
          const stored = await chrome.storage.local.get(["activeAddress"]);
          const address = stored.activeAddress ? [stored.activeAddress] : [];
          port.postMessage({ clientReqId, result: address });
          break;
        }

        case "eth_requestAccounts": {
          const stored = await chrome.storage.local.get(["activeAddress"]);
          if (stored.activeAddress) {
            port.postMessage({ clientReqId, result: [stored.activeAddress] });
          } else {
            // Queue approval request
            const internalId = crypto.randomUUID();
            pendingRequests.set(internalId, {
              internalId,
              clientReqId,
              origin,
              payload,
              port,
            });
            // Open popup to prompt account access
            chrome.action.openPopup?.();
          }
          break;
        }

        case "eth_sendTransaction": {
          const internalId = crypto.randomUUID();
          pendingRequests.set(internalId, {
            internalId,
            clientReqId,
            origin,
            payload,
            port,
          });
          chrome.action.openPopup?.();
          break;
        }

        default:
          port.postMessage({
            clientReqId,
            error: { code: 4200, message: `Unsupported method: ${payload.method}` },
          });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error in background worker";
      port.postMessage({ clientReqId, error: { code: -32603, message } });
    }
  });
});

// Internal message handler for communication with Popup UI
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PENDING_REQUESTS") {
    const list = Array.from(pendingRequests.values()).map((r) => ({
      internalId: r.internalId,
      origin: r.origin,
      method: r.payload.method,
      params: r.payload.params,
    }));
    sendResponse({ requests: list });
    return true;
  }

  if (message.type === "RESOLVE_REQUEST") {
    const { internalId, approved, result, error } = message;
    const pending = pendingRequests.get(internalId);
    if (pending) {
      if (approved) {
        pending.port.postMessage({ clientReqId: pending.clientReqId, result });
      } else {
        pending.port.postMessage({
          clientReqId: pending.clientReqId,
          error: { code: 4001, message: error || "User rejected request" },
        });
      }
      pendingRequests.delete(internalId);
    }
    sendResponse({ success: true });
    return true;
  }
});

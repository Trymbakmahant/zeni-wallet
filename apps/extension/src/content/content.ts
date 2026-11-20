/**
 * Zeni Content Script
 * Isolated execution realm between untrusted web page and the extension background worker.
 */

// inpage.js is injected by Chrome in the MAIN world; no script tag or CSP bypass.

// 2. Open long-lived port to background service worker
let bgPort: chrome.runtime.Port | null = null;

function getBackgroundPort(): chrome.runtime.Port {
  if (!bgPort) {
    bgPort = chrome.runtime.connect({ name: "zeni-dapp-bridge" });
    bgPort.onMessage.addListener((message) => {
      // Relay response back to window inpage provider
      window.postMessage(
        {
          target: "zeni-inpage-response",
          event: message.event,
          accounts: message.accounts,
          clientReqId: message.clientReqId,
          result: message.result,
          error: message.error,
        },
        window.location.origin
      );
    });

    bgPort.onDisconnect.addListener(() => {
      bgPort = null;
    });
  }
  return bgPort;
}

// 3. Listen for requests from inpage.js
window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }
  if (!event.data || event.data.target !== "zeni-content-bridge") {
    return;
  }

  const { clientReqId, payload } = event.data;
  if (!Number.isSafeInteger(clientReqId) || !payload || typeof payload.method !== "string" || payload.method.length > 100) return;
  const signing = payload.method === "personal_sign" || payload.method === "zeni_sendQor" || payload.method === "eth_sendTransaction";
  if (payload.params !== undefined || signing) {
    try {
      if (!Array.isArray(payload.params) || JSON.stringify(payload.params).length > 110000) throw new Error("Invalid parameters");
    } catch {
      window.postMessage({ target: "zeni-inpage-response", clientReqId, error: { code: -32602, message: "Invalid or oversized signing parameters." } }, window.location.origin);
      return;
    }
  }
  const port = getBackgroundPort();
  // The worker allowlists methods and validates all bounded parameters.
  port.postMessage({ clientReqId, payload: { method: payload.method, ...(payload.params !== undefined ? { params: payload.params } : {}) } });
});

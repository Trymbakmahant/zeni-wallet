/**
 * Zeni Content Script
 * Isolated execution realm between untrusted web page and the extension background worker.
 */

// 1. Inject inpage script tag
function injectScript(filePath: string) {
  try {
    const container = document.head || document.documentElement;
    const script = document.createElement("script");
    script.setAttribute("type", "text/javascript");
    script.setAttribute("src", chrome.runtime.getURL(filePath));
    container.insertBefore(script, container.firstChild);
    script.onload = () => script.remove();
  } catch (error) {
    console.error("Zeni: failed to inject inpage script", error);
  }
}

injectScript("inpage.js");

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
  const port = getBackgroundPort();
  port.postMessage({ clientReqId, payload });
});

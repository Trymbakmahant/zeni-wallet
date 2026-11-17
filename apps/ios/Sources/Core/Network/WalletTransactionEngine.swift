import Foundation
import WebKit

struct SwapQuote: Codable, Identifiable, Equatable {
    let id: String
    let tokenIn: String
    let tokenOut: String
    let poolId: String
    let amountIn: String
    let amountOut: String
    let minAmountOut: String
    let swapFee: String
    let impactBps: Int
    let slippageBps: Int
    let registrationRequired: Bool
    let maxNetworkFee: String
    let expiresAt: Double
    var expiration: Date { Date(timeIntervalSince1970: expiresAt / 1000) }
}

struct TransferQuote: Codable, Identifiable, Equatable {
    let id: String
    let from: String
    let to: String
    let amount: String
    let registrationRequired: Bool
    let maxNetworkFee: String
    let windowMaxValue: String
    let windowBlocks: Int
    let expiresAt: Double
    var expiration: Date { Date(timeIntervalSince1970: expiresAt / 1000) }
    var authorizationLimit: String {
        guard let units = Decimal(string: windowMaxValue) else { return windowMaxValue + " uqor" }
        return (units / 1_000_000).formatted() + " QOR"
    }
}

struct TransactionResult: Codable, Equatable {
    let hash: String
    let stage: String
    let status: String
    let explorerUrl: String
    let amountOut: String?
    let error: String?
}

struct WalletActivityItem: Codable, Identifiable, Equatable {
    let hash: String
    let account: String
    let nativeChain: Bool
    let stage: String
    let tokenIn: String?
    let tokenOut: String?
    let amountIn: String?
    let amountOut: String?
    let recipient: String?
    let timestamp: Double
    let status: String
    let gasCost: String?
    let error: String?
    var id: String { hash }

}

struct WalletBalances: Decodable {
    let bank: [String: String]
    let evmQor: String
}

enum WalletEngineError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let message): return message }
    }
}

/// Executes the same bundled transaction code as the extension in a local, isolated WebKit process.
/// No remote pages/scripts are loaded. Requests are relayed through a native endpoint allowlist.
@MainActor
final class WalletTransactionEngine: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate {
    private var webView: WKWebView?
    private var ready: CheckedContinuation<Void, Error>?
    private var loading: Task<Void, Error>?
    private let session: URLSession
    private let redirectDelegate = WalletNoRedirectDelegate()
    var permitsBroadcast = false
    var onTermination: (() -> Void)?
    var persistActivity: (([WalletActivityItem]) throws -> Void)?

    init(configuration: URLSessionConfiguration = .ephemeral) {
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 30
        configuration.httpShouldSetCookies = false
        session = URLSession(configuration: configuration, delegate: redirectDelegate, delegateQueue: nil)
        super.init()
    }

    private func start() async throws {
        if let loading { return try await loading.value }
        let task = Task { @MainActor in
            guard let url = Bundle.main.url(forResource: "WalletEngine", withExtension: "html") else {
                throw WalletEngineError.message("The wallet engine is missing from the app bundle.")
            }
            let html = try String(contentsOf: url, encoding: .utf8)
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .nonPersistent()
            configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "wallet")
            let view = WKWebView(frame: .zero, configuration: configuration)
            view.navigationDelegate = self
            view.isInspectable = false
            webView = view
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                ready = continuation
                view.loadHTMLString(html, baseURL: nil)
            }
        }
        loading = task
        do { try await task.value }
        catch { loading = nil; throw error }
    }

    func call<Result: Decodable>(_ method: String, payload: [String: Any] = [:], as type: Result.Type = Result.self) async throws -> Result {
        try await start()
        guard let webView else { throw WalletEngineError.message("Wallet engine is unavailable.") }
        let data = try JSONSerialization.data(withJSONObject: payload)
        let json = String(decoding: data, as: UTF8.self)
        do {
            let value = try await webView.callAsyncJavaScript(
                "return JSON.stringify(await window.ZeniEngine.invoke(method, JSON.parse(payloadJSON)));",
                arguments: ["method": method, "payloadJSON": json], in: nil, contentWorld: .page
            )
            guard let output = value as? String else { throw WalletEngineError.message("Invalid wallet response.") }
            return try JSONDecoder().decode(type, from: Data(output.utf8))
        } catch let error as NSError {
            // WebKit exposes JavaScript's exception message separately from the script and arguments.
            let message = error.userInfo["WKJavaScriptExceptionMessage"] as? String
            throw WalletEngineError.message(message ?? error.localizedDescription)
        }
    }

    func restoreActivity(_ items: [WalletActivityItem]) async throws {
        try await start()
        let json = String(decoding: try JSONEncoder().encode(items), as: UTF8.self)
        _ = try await webView?.callAsyncJavaScript(
            "return await window.ZeniEngine.invoke('restoreActivity', JSON.parse(historyJSON));",
            arguments: ["historyJSON": json], in: nil, contentWorld: .page
        )
    }

    func lock() {
        permitsBroadcast = false
        guard let webView else { return }
        webView.evaluateJavaScript("window.ZeniEngine?.invoke('lock', {})", completionHandler: nil)
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.webView === webView, message.frameInfo.isMainFrame,
              let body = message.body as? [String: Any], let kind = body["kind"] as? String else {
            replyHandler(nil, "Invalid wallet message."); return
        }
        Task { @MainActor in
            do {
                switch kind {
                case "activity":
                    let data = try JSONSerialization.data(withJSONObject: body["payload"] ?? [])
                    let items = try JSONDecoder().decode([WalletActivityItem].self, from: data)
                    guard let persistActivity else { throw WalletEngineError.message("Activity storage is unavailable.") }
                    try persistActivity(items)
                    replyHandler(true, nil)
                case "request":
                    guard let payload = body["payload"] as? [String: Any] else {
                        throw WalletEngineError.message("Invalid request.")
                    }
                    replyHandler(try await request(payload), nil)
                default:
                    throw WalletEngineError.message("Unsupported wallet message.")
                }
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }

    private func request(_ payload: [String: Any]) async throws -> [String: Any] {
        guard let address = payload["url"] as? String, let url = URL(string: address),
              url.scheme == "https", url.user == nil, url.password == nil, url.port == nil,
              ["api-testnet.qore.host", "evm-testnet.qore.host"].contains(url.host ?? ""),
              let method = payload["method"] as? String, ["GET", "POST"].contains(method) else {
            throw WalletEngineError.message("Wallet request is outside QoreChain Diana.")
        }
        let body = (payload["body"] as? String)?.data(using: .utf8)
        if method == "POST" {
            if url.host == "api-testnet.qore.host" {
                guard ["/cosmos/tx/v1beta1/simulate", "/cosmos/tx/v1beta1/txs"].contains(url.path) else {
                    throw WalletEngineError.message("Unsupported native wallet request.")
                }
                if url.path == "/cosmos/tx/v1beta1/txs", !permitsBroadcast {
                    throw WalletEngineError.message("Wallet locked. No further transaction was broadcast.")
                }
            } else {
                guard let body,
                      let rpc = try JSONSerialization.jsonObject(with: body) as? [String: Any],
                      let rpcMethod = rpc["method"] as? String else {
                    throw WalletEngineError.message("Invalid EVM request.")
                }
                let readMethods = ["eth_chainId", "eth_gasPrice", "eth_getCode", "eth_getBalance",
                                   "eth_getTransactionCount", "eth_getTransactionReceipt", "eth_getTransactionByHash",
                                   "eth_blockNumber", "eth_getBlockByNumber", "eth_estimateGas", "eth_call"]
                guard readMethods.contains(rpcMethod) || (rpcMethod == "eth_sendRawTransaction" && permitsBroadcast) else {
                    throw WalletEngineError.message("Wallet request is not authorized.")
                }
            }
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, data.count <= 8_000_000 else {
            throw WalletEngineError.message("Invalid QoreChain response.")
        }
        return ["status": response.statusCode, "body": String(decoding: data, as: UTF8.self)]
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        ready?.resume(); ready = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        ready?.resume(throwing: error); ready = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        ready?.resume(throwing: error); ready = nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.absoluteString == "about:blank" ? .allow : .cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        permitsBroadcast = false
        onTermination?()
        ready?.resume(throwing: WalletEngineError.message("Wallet engine stopped. Unlock again."))
        ready = nil
        loading = nil
        self.webView = nil
    }
}

private final class WalletNoRedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

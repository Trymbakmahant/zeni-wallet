import Foundation
import Observation

/// Reference prices used by the extension for Diana testnet, not live market prices.
enum TestnetValuation {
    private static let prices: [String: Decimal] = ["QOR": 2, "fUSD": 1, "fETH": 3100, "fBTC": 65000]

    static func value(symbol: String, balance: String) -> Decimal? {
        guard let price = prices[symbol],
              balance.range(of: #"^[0-9]+(\.[0-9]+)?$"#, options: .regularExpression) != nil,
              let amount = Decimal(string: balance, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        let value = amount * price
        return value.isNaN ? nil : value
    }

    static func total(tokens: [TokenItem]) -> Decimal? {
        var total: Decimal = 0
        for token in tokens {
            guard let value = value(symbol: token.symbol, balance: token.balance) else { return nil }
            total += value
        }
        return total.isNaN ? nil : total
    }

    static func formatted(_ value: Decimal) -> String {
        value.formatted(.currency(code: "USD").locale(Locale(identifier: "en_US")))
    }
}

public struct TokenItem: Identifiable, Equatable {
    public var id: String { symbol }
    public let symbol: String
    public let name: String
    public let balance: String
    public let usdValue: String
    public let icon: String

    public init(symbol: String, name: String, balance: String, usdValue: String, icon: String) {
        self.symbol = symbol
        self.name = name
        self.balance = balance
        self.usdValue = usdValue
        self.icon = icon
    }
}

@MainActor
@Observable
public final class AppState {
    public private(set) var activeAccount: PublicAccountInfo?
    public private(set) var isUnlocked = false
    public private(set) var tokens: [TokenItem] = AppState.emptyTokens
    private(set) var hasWallet = false
    private(set) var isAuthenticating = false
    private(set) var isTransacting = false
    private(set) var isRefreshing = false
    private(set) var evmQorBalance = "0"
    private(set) var hasLoadedBalances = false
    func explorerURL(for hash: String) async throws -> URL? {
        let runtime = try await transactionEngine()
        let raw: String? = try await runtime.call("explorerUrl", payload: ["hash": hash])
        guard let raw, let url = URL(string: raw), url.scheme == "https", url.host == "explore.qore.network" else { return nil }
        return url
    }
    var estimatedTotalUSD: String? {
        guard hasLoadedBalances, let total = TestnetValuation.total(tokens: tokens) else { return nil }
        return TestnetValuation.formatted(total)
    }
    private(set) var activity: [WalletActivityItem] = []
    var walletError: String?

    @ObservationIgnored lazy var connect = ZeniConnectController(state: self)
    @ObservationIgnored private var engine: WalletTransactionEngine?
    @ObservationIgnored private var sessionVersion = 0
    @ObservationIgnored private var activityLoadError: Error?
    @ObservationIgnored private let accountKey = "zeni.public-account.v1"
    @ObservationIgnored private let activityURL: URL?
    @ObservationIgnored private var signingKeyLoader: (String) async throws -> Data = { prompt in
        try await Task.detached { try KeychainManager.loadMasterEntropy(prompt: prompt) }.value
    }

    private static let emptyTokens = [
        TokenItem(symbol: "QOR", name: "QoreChain Native", balance: "0", usdValue: "—", icon: "💎"),
        TokenItem(symbol: "fUSD", name: "Faucet USD", balance: "0", usdValue: "—", icon: "💵"),
        TokenItem(symbol: "fETH", name: "Faucet Ethereum", balance: "0", usdValue: "—", icon: "Ξ"),
        TokenItem(symbol: "fBTC", name: "Faucet Bitcoin", balance: "0", usdValue: "—", icon: "₿")
    ]

    public init() {
        activityURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first?.appendingPathComponent("Zeni/activity-v1.json")
        if let data = UserDefaults.standard.data(forKey: accountKey),
           let account = try? JSONDecoder().decode(PublicAccountInfo.self, from: data) {
            activeAccount = account
            hasWallet = true
        }
        if let activityURL, FileManager.default.fileExists(atPath: activityURL.path) {
            do { activity = try JSONDecoder().decode([WalletActivityItem].self, from: Data(contentsOf: activityURL)) }
            catch { activityLoadError = error; walletError = "Transaction history could not be loaded. Sending is unavailable until it can be recovered." }
        }
    }

    // Inject a public account and isolated runtime for tests without accessing the real Keychain.
    init(account: PublicAccountInfo, engine: WalletTransactionEngine,
         signingKeyLoader: @escaping (String) async throws -> Data) {
        activityURL = nil
        activeAccount = account
        hasWallet = true
        self.engine = engine
        self.signingKeyLoader = signingKeyLoader
    }

    private func transactionEngine() async throws -> WalletTransactionEngine {
        if let engine { return engine }
        let new = WalletTransactionEngine()
        new.onTermination = { [weak self] in
            self?.isUnlocked = false
            self?.sessionVersion += 1
            self?.engine = nil
            self?.walletError = "The wallet engine stopped. Refresh and review again; check Activity before retrying a transaction."
        }
        new.persistActivity = { [weak self] items in
            guard let self, let activityURL = self.activityURL else {
                throw WalletEngineError.message("Cannot save transaction history.")
            }
            try FileManager.default.createDirectory(at: activityURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(items)
            try data.write(to: activityURL, options: .atomic)
            self.activity = items
        }
        // Assign before suspension so concurrent readers share the same isolated engine.
        engine = new
        do { try await new.restoreActivity(activity) }
        catch { engine = nil; throw error }
        return new
    }

    func generateRecoveryPhrase() async throws -> String {
        guard !hasWallet, !isAuthenticating else { throw WalletEngineError.message("A wallet is already saved or setup is in progress.") }
        let runtime = try await transactionEngine()
        return try await runtime.call("generateMnemonic")
    }

    func validateRecoveryPhrase(_ phrase: String) async throws -> Bool {
        let runtime = try await transactionEngine()
        return try await runtime.call("validateMnemonic", payload: ["mnemonic": phrase])
    }

    func importWallet(mnemonic: String) async throws {
        guard !hasWallet, !isAuthenticating, !isTransacting else {
            throw WalletEngineError.message("A wallet is already saved or another operation is in progress.")
        }
        isAuthenticating = true
        defer { isAuthenticating = false }
        let version = sessionVersion
        let normalized = KeyDerivation.normalizeMnemonic(mnemonic)
        let runtime = try await transactionEngine()
        do {
            let account: PublicAccountInfo = try await runtime.call("unlock", payload: ["mnemonic": normalized])
            guard version == sessionVersion else { throw CancellationError() }
            // Only the protected Keychain receives the phrase; preferences contain public account data.
            try await Task.detached { try KeychainManager.saveMasterEntropy(data: Data(normalized.utf8)) }.value
            let data = try JSONEncoder().encode(account)
            UserDefaults.standard.set(data, forKey: accountKey)
            activeAccount = account
            hasWallet = true
            guard version == sessionVersion else { runtime.lock(); return }
            runtime.lock()
            isUnlocked = false
            walletError = nil
            await refresh()
        } catch {
            runtime.lock()
            throw error
        }
    }

    private func publicEngine() async throws -> WalletTransactionEngine {
        guard let account = activeAccount else { throw WalletEngineError.message("Import a wallet first.") }
        let runtime = try await transactionEngine()
        let _: Bool = try await runtime.call("watchAccount", payload: [
            "evmAddress": account.evmAddress, "cosmosAddress": account.cosmosAddress,
            "pqcPublicKeyHex": account.pqcPublicKeyHex, "pqcPublicKeyHashHex": account.pqcPublicKeyHashHex
        ])
        return runtime
    }

    private func withSigningAuthorization<Result>(
        prompt: String,
        operation: (WalletTransactionEngine) async throws -> Result
    ) async throws -> Result {
        try requireTransactionAccount()
        guard !isTransacting, !isAuthenticating, let expectedAccount = activeAccount else {
            throw WalletEngineError.message("Another wallet operation is in progress.")
        }
        isTransacting = true
        isAuthenticating = true
        let version = sessionVersion
        defer { isTransacting = false; isAuthenticating = false; isUnlocked = false }
        let runtime = try await publicEngine()
        // Every signature obtains a fresh Keychain authentication context. No browsing unlock is reused.
        defer { runtime.lock() }
        let data = try await signingKeyLoader(prompt)
        guard version == sessionVersion, activeAccount == expectedAccount else { throw CancellationError() }
        guard let mnemonic = String(data: data, encoding: .utf8) else {
            throw WalletEngineError.message("The saved wallet could not be read.")
        }
        let signer: PublicAccountInfo = try await runtime.call("unlock", payload: ["mnemonic": mnemonic])
        guard version == sessionVersion, signer == expectedAccount else {
            throw WalletEngineError.message("Wallet changed or authorization was cancelled. Review again.")
        }
        isAuthenticating = false
        isUnlocked = true
        return try await operation(runtime)
    }

    func lock() {
        sessionVersion += 1
        isUnlocked = false
        engine?.lock()
        connect.walletLocked()
    }

    func refresh() async {
        guard hasWallet, let account = activeAccount, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let runtime = try await publicEngine()
            let balances: WalletBalances = try await runtime.call("balances")
            guard activeAccount == account else { return }
            tokens = Self.emptyTokens.map { token in
                let balance = balances.bank[token.symbol] ?? "0"
                let value = TestnetValuation.value(symbol: token.symbol, balance: balance)
                return TokenItem(symbol: token.symbol, name: token.name, balance: balance,
                                 usdValue: value.map { TestnetValuation.formatted($0) } ?? "—", icon: token.icon)
            }
            evmQorBalance = balances.evmQor
            hasLoadedBalances = true
            if activityLoadError == nil {
                let _: [WalletActivityItem] = try await runtime.call("reconcile")
                walletError = nil
            }
        } catch {
            if activeAccount == account { walletError = error.localizedDescription }
        }
    }

    func prepareSwap(tokenIn: String, tokenOut: String, amount: String, slippageBps: Int) async throws -> SwapQuote {
        try requireTransactionAccount()
        let version = sessionVersion
        let runtime = try await publicEngine()
        let quote: SwapQuote = try await runtime.call("prepareSwap", payload: [
            "tokenIn": tokenIn, "tokenOut": tokenOut, "amount": amount, "slippageBps": slippageBps
        ])
        guard version == sessionVersion else { throw CancellationError() }
        return quote
    }

    func prepareTransfer(recipient: String, amount: String, token: String) async throws -> TransferQuote {
        try requireTransactionAccount()
        let version = sessionVersion
        let runtime = try await publicEngine()
        let quote: TransferQuote = try await runtime.call("prepareTransfer", payload: [
            "recipient": recipient, "amount": amount, "token": token
        ])
        guard version == sessionVersion else { throw CancellationError() }
        return quote
    }

    func execute(quoteID: String, isSwap: Bool, validateRequest: () throws -> Void = {}) async throws -> TransactionResult {
        do {
            let result: TransactionResult = try await withSigningAuthorization(
                prompt: isSwap ? "Authorize this swap in Zeni" : "Authorize this transfer in Zeni"
            ) { runtime in
                try validateRequest()
                runtime.permitsBroadcast = true
                defer { runtime.permitsBroadcast = false }
                return try await runtime.call(isSwap ? "executeSwap" : "executeTransfer", payload: ["quoteId": quoteID])
            }
            await refresh()
            return result
        } catch {
            await refresh()
            throw error
        }
    }

    func prepareDapp(method: String, params: [Any]) async throws -> DappReview {
        try requireTransactionAccount()
        let version = sessionVersion
        let runtime = try await publicEngine()
        let review: DappReview = try await runtime.call("prepareDapp", payload: ["method": method, "params": params])
        guard version == sessionVersion else { throw CancellationError() }
        return review
    }

    func executeDapp(review: DappReview, validateRequest: () throws -> Void = {}) async throws -> String {
        try requireTransactionAccount()
        if review.kind == "transfer", let quote = review.quote {
            let result = try await execute(quoteID: quote.id, isSwap: false, validateRequest: validateRequest)
            guard result.stage == "transfer", result.status != "FAILED" else {
                throw WalletEngineError.message(result.error ?? "Transfer did not complete. Check Activity before retrying.")
            }
            return result.hash
        }
        guard review.kind == "message" else { throw WalletEngineError.message("Unsupported signing request.") }
        let version = sessionVersion
        return try await withSigningAuthorization(prompt: "Authorize this message signature in Zeni") { runtime in
            try validateRequest()
            let signature: String = try await runtime.call("signDappMessage", payload: ["reviewId": review.reviewId])
            guard version == sessionVersion else { throw CancellationError() }
            return signature
        }
    }

    private func requireTransactionAccount() throws {
        guard hasWallet, activeAccount != nil else { throw WalletEngineError.message("Import a wallet to continue.") }
        guard activityLoadError == nil else {
            throw WalletEngineError.message("Transaction history could not be loaded. Recover it before sending another transaction.")
        }
    }
}

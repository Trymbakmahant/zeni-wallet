import Foundation
import Observation

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
    private(set) var activity: [WalletActivityItem] = []
    var walletError: String?

    @ObservationIgnored private var engine: WalletTransactionEngine?
    @ObservationIgnored private var sessionVersion = 0
    @ObservationIgnored private var activityLoadError: Error?
    @ObservationIgnored private let accountKey = "zeni.public-account.v1"
    @ObservationIgnored private let activityURL: URL?

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

    private func transactionEngine() async throws -> WalletTransactionEngine {
        if activityLoadError != nil {
            throw WalletEngineError.message("Transaction history could not be loaded. Recover it before sending another transaction.")
        }
        if let engine { return engine }
        let new = WalletTransactionEngine()
        new.onTermination = { [weak self] in
            self?.isUnlocked = false
            self?.sessionVersion += 1
            self?.engine = nil
            self?.walletError = "The wallet engine stopped. Unlock again; check Activity before retrying a transaction."
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
            isUnlocked = true
            walletError = nil
            await refresh()
        } catch {
            runtime.lock()
            throw error
        }
    }

    func unlock() async throws {
        guard hasWallet, !isAuthenticating, !isTransacting else {
            throw WalletEngineError.message("Import a wallet first, or wait for the current operation.")
        }
        isAuthenticating = true
        defer { isAuthenticating = false }
        let version = sessionVersion
        let data = try await Task.detached { try KeychainManager.loadMasterEntropy() }.value
        guard version == sessionVersion else { throw CancellationError() }
        guard let mnemonic = String(data: data, encoding: .utf8) else {
            throw WalletEngineError.message("The saved wallet could not be read.")
        }
        let runtime = try await transactionEngine()
        let account: PublicAccountInfo = try await runtime.call("unlock", payload: ["mnemonic": mnemonic])
        guard version == sessionVersion, account.evmAddress == activeAccount?.evmAddress else {
            runtime.lock()
            throw WalletEngineError.message("Wallet changed or was locked. Unlock again.")
        }
        isUnlocked = true
        walletError = nil
        await refresh()
    }

    func lock() {
        sessionVersion += 1
        isUnlocked = false
        engine?.lock()
    }

    func refresh() async {
        guard isUnlocked, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        let version = sessionVersion
        do {
            let runtime = try await transactionEngine()
            let balances: WalletBalances = try await runtime.call("balances")
            guard version == sessionVersion else { return }
            tokens = Self.emptyTokens.map { token in
                TokenItem(symbol: token.symbol, name: token.name, balance: balances.bank[token.symbol] ?? "0", usdValue: "—", icon: token.icon)
            }
            evmQorBalance = balances.evmQor
            let _: [WalletActivityItem] = try await runtime.call("reconcile")
            walletError = nil
        } catch {
            if version == sessionVersion { walletError = error.localizedDescription }
        }
    }

    func prepareSwap(tokenIn: String, tokenOut: String, amount: String, slippageBps: Int) async throws -> SwapQuote {
        try requireUnlocked()
        let version = sessionVersion
        let runtime = try await transactionEngine()
        let quote: SwapQuote = try await runtime.call("prepareSwap", payload: [
            "tokenIn": tokenIn, "tokenOut": tokenOut, "amount": amount, "slippageBps": slippageBps
        ])
        guard version == sessionVersion else { throw CancellationError() }
        return quote
    }

    func prepareTransfer(recipient: String, amount: String, token: String) async throws -> TransferQuote {
        try requireUnlocked()
        let version = sessionVersion
        let runtime = try await transactionEngine()
        let quote: TransferQuote = try await runtime.call("prepareTransfer", payload: [
            "recipient": recipient, "amount": amount, "token": token
        ])
        guard version == sessionVersion else { throw CancellationError() }
        return quote
    }

    func execute(quoteID: String, isSwap: Bool) async throws -> TransactionResult {
        try requireUnlocked()
        guard !isTransacting else { throw WalletEngineError.message("A transaction is already in progress.") }
        isTransacting = true
        let version = sessionVersion
        defer { isTransacting = false }
        let runtime = try await transactionEngine()
        guard version == sessionVersion else { throw CancellationError() }
        runtime.permitsBroadcast = true
        defer { runtime.permitsBroadcast = false }
        do {
            let result: TransactionResult = try await runtime.call(isSwap ? "executeSwap" : "executeTransfer", payload: ["quoteId": quoteID])
            await refresh()
            return result
        } catch {
            await refresh()
            throw error
        }
    }

    private func requireUnlocked() throws {
        guard isUnlocked else { throw WalletEngineError.message("Unlock your wallet to continue.") }
    }
}

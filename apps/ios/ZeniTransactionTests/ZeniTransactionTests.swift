import Foundation
import Testing
@testable import Zeni

@Suite(.serialized)
@MainActor
struct ZeniTransactionTests {
    // Public Hardhat fixture; never saved to Keychain and never funded or broadcast.
    private let referencePhrase = "test test test test test test test test test test test junk"

    @Test func portfolioValuesAllAssetsInUSD() throws {
        let tokens = [("QOR", "212.683027"), ("fUSD", "990.523913"), ("fETH", "0.5"), ("fBTC", "0.02")].map {
            TokenItem(symbol: $0.0, name: $0.0, balance: $0.1, usdValue: "—", icon: "")
        }
        let total = try #require(TestnetValuation.total(tokens: tokens))
        #expect(total == Decimal(string: "4265.889967"))
        #expect(TestnetValuation.formatted(total) == "$4,265.89")
    }

    @Test func portfolioRoundsOnlyAfterSummingAndFormatsLargeTotals() throws {
        let tokens = [("QOR", "0.002"), ("fUSD", "0.004")].map {
            TokenItem(symbol: $0.0, name: $0.0, balance: $0.1, usdValue: "—", icon: "")
        }
        #expect(TestnetValuation.formatted(try #require(TestnetValuation.total(tokens: tokens))) == "$0.01")
        #expect(TestnetValuation.formatted(1234567) == "$1,234,567.00")
        #expect(TestnetValuation.formatted(0) == "$0.00")
    }

    @Test func portfolioDoesNotTreatUnpricedOrInvalidAssetsAsZero() {
        #expect(TestnetValuation.value(symbol: "OTHER", balance: "10") == nil)
        #expect(TestnetValuation.value(symbol: "QOR", balance: "12broken") == nil)
        #expect(TestnetValuation.value(symbol: "QOR", balance: "-1") == nil)
        #expect(TestnetValuation.total(tokens: [TokenItem(symbol: "OTHER", name: "Other", balance: "10", usdValue: "—", icon: "")]) == nil)
    }

    @Test func onboardingGeneratesValidFreshPhrasesWithoutUnlocking() async throws {
        let engine = WalletTransactionEngine()
        defer { engine.lock() }
        let first: String = try await engine.call("generateMnemonic")
        let second: String = try await engine.call("generateMnemonic")
        #expect(first.split(separator: " ").count == 12)
        #expect(first != second)
        let valid: Bool = try await engine.call("validateMnemonic", payload: ["mnemonic": first])
        #expect(valid)
        do {
            let _: WalletBalances = try await engine.call("balances")
            Issue.record("Generating a backup must not unlock an account")
        } catch { #expect(error.localizedDescription.contains("Import a wallet")) }
    }

    @Test func onboardingImportChecksChecksumAndNormalizesWhitespace() async throws {
        let engine = WalletTransactionEngine()
        let valid: Bool = try await engine.call("validateMnemonic", payload: ["mnemonic": "  " + referencePhrase.uppercased().replacingOccurrences(of: " ", with: "\n") + "  "])
        let invalid: Bool = try await engine.call("validateMnemonic", payload: ["mnemonic": Array(repeating: "test", count: 12).joined(separator: " ")])
        #expect(valid)
        #expect(!invalid)
    }

    private func fixture() async throws -> (WalletTransactionEngine, MockChain) {
        let chain = MockChain()
        MockChainProtocol.chain = chain
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockChainProtocol.self]
        let engine = WalletTransactionEngine(configuration: configuration)
        engine.persistActivity = { chain.persist($0) }
        let account: PublicAccountInfo = try await engine.call("unlock", payload: ["mnemonic": referencePhrase])
        chain.configure(account: account)
        return (engine, chain)
    }

    @Test func liveQuoteUsesBankUnitsAndReservesSetupFees() async throws {
        let (engine, chain) = try await fixture()
        defer { engine.lock() }
        let balances: WalletBalances = try await engine.call("balances")
        #expect(balances.bank["QOR"] == "10.0")
        #expect(balances.bank["fETH"] == "0.5")
        #expect(balances.bank["fBTC"] == "0.02")
        let quote: SwapQuote = try await engine.call("prepareSwap", payload: ["tokenIn": "QOR", "tokenOut": "fUSD", "amount": "MAX", "slippageBps": 50])
        #expect(quote.amountIn == "9.82")
        #expect(quote.minAmountOut == "0.080656")
        #expect(quote.registrationRequired)
        #expect(chain.broadcastCount == 0)
    }

    @Test func confirmedSwapPersistsRealHashesAndUsesReceiptOutput() async throws {
        let (engine, chain) = try await fixture()
        defer { engine.lock() }
        let quote: SwapQuote = try await engine.call("prepareSwap", payload: ["tokenIn": "QOR", "tokenOut": "fUSD", "amount": "1", "slippageBps": 50])
        engine.permitsBroadcast = true
        let result: TransactionResult = try await engine.call("executeSwap", payload: ["quoteId": quote.id])
        #expect(result.status == "CONFIRMED")
        #expect(result.amountOut == "0.08107")
        #expect(chain.broadcastCount == 2)
        #expect(chain.savedBeforeBroadcast)
        #expect(chain.records.allSatisfy { $0.status == "CONFIRMED" })
        #expect(Set(chain.records.map(\.stage)) == ["registration", "swap"])
    }

    @Test func uncertainSetupBroadcastRemainsPending() async throws {
        let (engine, chain) = try await fixture()
        defer { engine.lock() }
        let quote: SwapQuote = try await engine.call("prepareSwap", payload: ["tokenIn": "QOR", "tokenOut": "fUSD", "amount": "1", "slippageBps": 50])
        chain.loseBroadcastResponse = true
        engine.permitsBroadcast = true
        let result: TransactionResult = try await engine.call("executeSwap", payload: ["quoteId": quote.id])
        #expect(result.status == "PENDING")
        #expect(result.stage == "registration")
        #expect(chain.records.first?.hash == result.hash)
        #expect(chain.savedBeforeBroadcast)
        #expect(chain.broadcastCount == 1)
    }

    @Test func reviewedTransferUsesHybridNativeBankSend() async throws {
        let (engine, chain) = try await fixture()
        defer { engine.lock() }
        let quote: TransferQuote = try await engine.call("prepareTransfer", payload: [
            "recipient": "0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a", "amount": "1", "token": "QOR"
        ])
        #expect(quote.kind == "native-qor")
        #expect(quote.amountUqor == "1000000")
        #expect(chain.broadcastCount == 0)
        engine.permitsBroadcast = true
        let result: TransactionResult = try await engine.call("executeTransfer", payload: ["quoteId": quote.id])
        #expect(result.status == "CONFIRMED")
        #expect(!result.hash.hasPrefix("0x"))
        #expect(result.hash.count == 64)
        #expect(chain.broadcastCount == 2)
        #expect(chain.savedBeforeBroadcast)
        #expect(Set(chain.records.map(\.stage)) == ["registration", "transfer"])
    }

    @Test func bundledEngineDerivesReferenceAccount() async throws {
        let engine = WalletTransactionEngine()
        defer { engine.lock() }
        let account: PublicAccountInfo = try await engine.call("unlock", payload: ["mnemonic": referencePhrase])
        #expect(account.evmAddress == "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
        #expect(account.cosmosAddress.hasPrefix("qor1"))
        #expect(account.pqcPublicKeyHashHex.count == 66)
    }

    @Test func invalidRecoveryPhraseIsRejected() async throws {
        let engine = WalletTransactionEngine()
        do {
            let _: PublicAccountInfo = try await engine.call("unlock", payload: ["mnemonic": "not a recovery phrase"])
            Issue.record("Invalid recovery phrase was accepted.")
        } catch {
            #expect(error.localizedDescription.contains("valid BIP-39"))
        }
    }

    @Test func lockedEngineCannotExecuteTransactions() async throws {
        let engine = WalletTransactionEngine()
        do {
            let _: TransactionResult = try await engine.call("executeSwap", payload: ["quoteId": "unreviewed"])
            Issue.record("Locked engine accepted a transaction.")
        } catch {
            #expect(error.localizedDescription.contains("Unlock"))
        }
    }

    @Test func unreviewedQuoteCannotExecuteAfterUnlock() async throws {
        let engine = WalletTransactionEngine()
        defer { engine.lock() }
        let _: PublicAccountInfo = try await engine.call("unlock", payload: ["mnemonic": referencePhrase])
        do {
            let _: TransactionResult = try await engine.call("executeTransfer", payload: ["quoteId": "unreviewed"])
            Issue.record("Unreviewed transaction was accepted.")
        } catch {
            #expect(error.localizedDescription.contains("fresh quote"))
        }
    }
    @Test(arguments: ["0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a", "qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp"])
    func dappTransferUsesReviewedHybridNativeBankSend(recipient: String) async throws {
        let (engine, chain) = try await fixture()
        defer { engine.lock() }
        let review: DappReview = try await engine.call("prepareDapp", payload: ["method": "zeni_sendQor", "params": [[
            "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "to": recipient, "value": "0xde0b6b3a7640000", "chainId": "0x2648"
        ]]])
        #expect(review.kind == "transfer")
        #expect(review.quote?.amount == "1.0")
        #expect(review.quote?.to.lowercased() == "0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a")
        #expect(chain.broadcastCount == 0)
        engine.permitsBroadcast = true
        let result: TransactionResult = try await engine.call("executeTransfer", payload: ["quoteId": review.reviewId])
        #expect(result.stage == "transfer")
        #expect(!result.hash.hasPrefix("0x"))
        #expect(result.hash.count == 64)
        #expect(chain.broadcastCount > 0)
        #expect(chain.savedBeforeBroadcast)
    }

    private func viewingFixture(
        signingKeyLoader: @escaping (String) async throws -> Data
    ) async throws -> (AppState, WalletTransactionEngine, MockChain) {
        let (derivationEngine, chain) = try await fixture()
        let account: PublicAccountInfo = try await derivationEngine.call("unlock", payload: ["mnemonic": referencePhrase])
        derivationEngine.lock()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockChainProtocol.self]
        // This runtime starts with public metadata only; it has never received recovery words.
        let engine = WalletTransactionEngine(configuration: configuration)
        engine.persistActivity = { chain.persist($0) }
        let state = AppState(account: account, engine: engine, signingKeyLoader: signingKeyLoader)
        return (state, engine, chain)
    }

    @Test func uncertainNativeTransferCannotReportDappSuccess() async throws {
        let phrase = referencePhrase
        let (state, engine, chain) = try await viewingFixture { _ in Data(phrase.utf8) }
        let review = try await state.prepareDapp(method: "zeni_sendQor", params: [[
            "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            "to": "qor1ff44amgm07w2nrfuk6u25kfu8tlprdm2yj52dp",
            "value": "0xde0b6b3a7640000", "chainId": "0x2648"
        ]])
        chain.loseTransferResponse = true
        do {
            _ = try await state.executeDapp(review: review)
            Issue.record("An uncertain transfer was reported as confirmed to the web app")
        } catch { #expect(error.localizedDescription.contains("Broadcast status is unknown")) }
        #expect(chain.broadcastCount == 2)
        #expect(chain.savedBeforeBroadcast)
        #expect(!state.isUnlocked)
        #expect(!engine.permitsBroadcast)
    }

    @Test func publicBalancesAndQuotesDoNotRequestAuthentication() async throws {
        var authenticationCount = 0
        let (state, engine, chain) = try await viewingFixture { _ in
            authenticationCount += 1
            throw CancellationError()
        }
        await state.refresh()
        #expect(state.hasLoadedBalances)
        #expect(state.tokens.first { $0.symbol == "QOR" }?.balance == "10.0")
        #expect(state.evmQorBalance == "10.0")
        let swap = try await state.prepareSwap(tokenIn: "QOR", tokenOut: "fUSD", amount: "1", slippageBps: 50)
        let transfer = try await state.prepareTransfer(recipient: "0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a", amount: "1", token: "QOR")
        #expect(swap.amountIn == "1.0")
        #expect(transfer.amount == "1.0")
        #expect(authenticationCount == 0)
        #expect(!state.isUnlocked)
        #expect(chain.broadcastCount == 0)
        do {
            let _: TransactionResult = try await engine.call("executeSwap", payload: ["quoteId": swap.id])
            Issue.record("A public-only runtime signed a transaction")
        } catch { #expect(error.localizedDescription.contains("Unlock")) }
        state.lock()
        await state.refresh()
        #expect(state.hasLoadedBalances)
        #expect(authenticationCount == 0)
    }

    @Test func eachSwapAuthenticatesAndDiscardsSigningAccess() async throws {
        var authenticationCount = 0
        let phrase = referencePhrase
        let (state, engine, chain) = try await viewingFixture { _ in
            authenticationCount += 1
            return Data(phrase.utf8)
        }
        for expectedCount in 1...2 {
            let quote = try await state.prepareSwap(tokenIn: "QOR", tokenOut: "fUSD", amount: "1", slippageBps: 50)
            #expect(authenticationCount == expectedCount - 1)
            let result = try await state.execute(quoteID: quote.id, isSwap: true)
            #expect(result.status == "CONFIRMED")
            #expect(authenticationCount == expectedCount)
            #expect(!state.isUnlocked)
            #expect(!state.isAuthenticating)
            #expect(!engine.permitsBroadcast)
            do {
                let _: TransactionResult = try await engine.call("executeSwap", payload: ["quoteId": quote.id])
                Issue.record("Signing key remained unlocked after execution")
            } catch { #expect(error.localizedDescription.contains("Unlock")) }
        }
        #expect(chain.broadcastCount == 3) // One registration, then two swaps.
    }

    @Test func cancelledAuthenticationNeverBroadcastsAndBalancesRemainVisible() async throws {
        var authenticationCount = 0
        let (state, engine, chain) = try await viewingFixture { _ in
            authenticationCount += 1
            throw CancellationError()
        }
        let quote = try await state.prepareTransfer(recipient: "0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a", amount: "1", token: "QOR")
        do {
            _ = try await state.execute(quoteID: quote.id, isSwap: false)
            Issue.record("Cancelled authentication was accepted")
        } catch { #expect(error is CancellationError) }
        #expect(authenticationCount == 1)
        #expect(chain.broadcastCount == 0)
        #expect(!engine.permitsBroadcast)
        #expect(!state.isUnlocked)
        #expect(!state.isTransacting)
        #expect(state.hasLoadedBalances)
    }

    @Test func messageReviewIsPublicButEachSignatureAuthenticates() async throws {
        var authenticationCount = 0
        let phrase = referencePhrase
        let (state, _, chain) = try await viewingFixture { _ in
            authenticationCount += 1
            return Data(phrase.utf8)
        }
        for expectedCount in 1...2 {
            let review = try await state.prepareDapp(method: "personal_sign", params: [
                "0x68656c6c6f", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
            ])
            #expect(review.message == "hello")
            #expect(authenticationCount == expectedCount - 1)
            let signature = try await state.executeDapp(review: review)
            #expect(signature.hasPrefix("0x"))
            #expect(signature.count == 132)
            #expect(authenticationCount == expectedCount)
            #expect(!state.isUnlocked)
        }
        #expect(chain.broadcastCount == 0)
    }

    @Test func backgroundingDuringAuthenticationCancelsSigning() async throws {
        var model: AppState?
        let phrase = referencePhrase
        let (state, engine, chain) = try await viewingFixture { _ in
            model?.lock()
            return Data(phrase.utf8)
        }
        model = state
        let quote = try await state.prepareSwap(tokenIn: "QOR", tokenOut: "fUSD", amount: "1", slippageBps: 50)
        do {
            _ = try await state.execute(quoteID: quote.id, isSwap: true)
            Issue.record("A backgrounded authentication session signed")
        } catch { #expect(error is CancellationError) }
        #expect(chain.broadcastCount == 0)
        #expect(!state.isUnlocked)
        #expect(!engine.permitsBroadcast)
    }

    @Test func requestIsRevalidatedAfterAuthenticationBeforeBroadcast() async throws {
        let phrase = referencePhrase
        let (state, engine, chain) = try await viewingFixture { _ in Data(phrase.utf8) }
        let quote = try await state.prepareTransfer(recipient: "0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a", amount: "1", token: "QOR")
        do {
            _ = try await state.execute(quoteID: quote.id, isSwap: false) {
                throw WalletEngineError.message("Request expired during authentication")
            }
            Issue.record("Expired request was broadcast")
        } catch { #expect(error.localizedDescription.contains("Request expired")) }
        #expect(chain.broadcastCount == 0)
        #expect(!state.isUnlocked)
        #expect(!engine.permitsBroadcast)
    }

    @Test func additionalAccountsAreDistinctAndDerivationDoesNotChangeSelectedAccount() async throws {
        let (engine, chain) = try await fixture()
        defer { engine.lock() }
        let second: PublicAccountInfo = try await engine.call("derivePublicAccount", payload: ["mnemonic": referencePhrase, "accountIndex": 1])
        let third: PublicAccountInfo = try await engine.call("derivePublicAccount", payload: ["mnemonic": referencePhrase, "accountIndex": 2])
        #expect(second.evmAddress != third.evmAddress)
        #expect(second.pqcPublicKeyHashHex != third.pqcPublicKeyHashHex)
        let current: WalletHistoryPage = try await engine.call("accountActivity")
        #expect(current.items.first?.stage == "receive") // Mock receipt still belongs to Account 1.
        let restored: PublicAccountInfo = try await engine.call("unlock", payload: ["mnemonic": referencePhrase, "accountIndex": 1])
        #expect(restored == second)
        let isolated: WalletHistoryPage = try await engine.call("accountActivity")
        #expect(isolated.items.isEmpty)
        #expect(chain.broadcastCount == 0)
        do {
            let _: PublicAccountInfo = try await engine.call("derivePublicAccount", payload: ["mnemonic": referencePhrase, "accountIndex": -1])
            Issue.record("Invalid derivation index accepted")
        } catch { #expect(!error.localizedDescription.isEmpty) }
    }

    @Test func activityReadsIncomingTransfersWithoutSigningAndRetainsCachedRowsOffline() async throws {
        let (engine, chain) = try await fixture()
        engine.lock()
        let page: WalletHistoryPage = try await engine.call("accountActivity")
        #expect(page.error == nil)
        #expect(page.items.count == 1) // Same receipt from multiple search streams is deduplicated.
        #expect(page.items.first?.stage == "receive")
        #expect(page.items.first?.amountIn == "5.0")
        #expect(page.items.first?.tokenIn == "QOR")
        #expect(page.items.first?.source == "chain")
        #expect(!page.hasMore)
        chain.historyUnavailable = true
        let offline: WalletHistoryPage = try await engine.call("accountActivity")
        #expect(offline.error != nil)
        #expect(offline.items == page.items)
        #expect(chain.records.isEmpty) // Remote history never enters the broadcast journal.
        #expect(chain.broadcastCount == 0)
    }

    @Test func legacyActivityJournalStillDecodes() throws {
        let data = Data(#"{"hash":"ABC","account":"qor1fixture","nativeChain":true,"stage":"transfer","timestamp":1000,"status":"PENDING"}"#.utf8)
        let item = try JSONDecoder().decode(WalletActivityItem.self, from: data)
        #expect(item.source == nil)
        #expect(item.transfers == nil)
        #expect(item.id == "abc")
        #expect(item.title == "Send")
    }

    @Test func switchingAccountsInvalidatesOldReviewAndNewAccountCanTransfer() async throws {
        let (engine, chain) = try await fixture()
        defer { engine.lock() }
        let recipient = "0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a"
        let oldQuote: TransferQuote = try await engine.call("prepareTransfer", payload: ["recipient": recipient, "amount": "1", "token": "QOR"])
        let second: PublicAccountInfo = try await engine.call("unlock", payload: ["mnemonic": referencePhrase, "accountIndex": 1])
        chain.configure(account: second)
        engine.permitsBroadcast = true
        do {
            let _: TransactionResult = try await engine.call("executeTransfer", payload: ["quoteId": oldQuote.id])
            Issue.record("Previous account's review remained usable")
        } catch { #expect(chain.broadcastCount == 0) }
        let quote: TransferQuote = try await engine.call("prepareTransfer", payload: ["recipient": recipient, "amount": "1", "token": "QOR"])
        let result: TransactionResult = try await engine.call("executeTransfer", payload: ["quoteId": quote.id])
        #expect(result.status == "CONFIRMED")
        #expect(chain.records.allSatisfy { $0.account == second.cosmosAddress })
        #expect(chain.broadcastCount == 2)
        #expect(chain.savedBeforeBroadcast)
    }

}

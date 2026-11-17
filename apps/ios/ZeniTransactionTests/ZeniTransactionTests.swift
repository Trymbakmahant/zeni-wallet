import Foundation
import Testing
@testable import Zeni

@Suite(.serialized)
@MainActor
struct ZeniTransactionTests {
    // Public Hardhat fixture; never saved to Keychain and never funded or broadcast.
    private let referencePhrase = "test test test test test test test test test test test junk"

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

    @Test func reviewedTransferSignsOnlyAfterNativeAuthorization() async throws {
        let (engine, chain) = try await fixture()
        defer { engine.lock() }
        let quote: TransferQuote = try await engine.call("prepareTransfer", payload: [
            "recipient": "0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a", "amount": "1", "token": "QOR"
        ])
        #expect(quote.windowBlocks == 60)
        #expect(chain.broadcastCount == 0)
        engine.permitsBroadcast = true
        let result: TransactionResult = try await engine.call("executeTransfer", payload: ["quoteId": quote.id])
        #expect(result.status == "PENDING")
        #expect(result.hash.hasPrefix("0x"))
        #expect(chain.broadcastCount == 3)
        #expect(chain.savedBeforeBroadcast)
        #expect(Set(chain.records.map(\.stage)) == ["registration", "authorization", "transfer"])
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
}

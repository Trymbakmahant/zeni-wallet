import SwiftUI
import CoreImage.CIFilterBuiltins
import UIKit

enum TransactionDestination: String, Identifiable {
    case send, receive, swap, wallet, activity
    var id: Self { self }
    var title: LocalizedStringKey {
        switch self {
        case .send: "Send Tokens"
        case .receive: "Receive Assets"
        case .swap: "In-Wallet Swap"
        case .wallet: "Your Wallet"
        case .activity: "Activity"
        }
    }
}

struct WalletTransactionSheet: View {
    let state: AppState
    let destination: TransactionDestination
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            TransactionSheetHeader(destination: destination) { dismiss() }
                .disabled(state.isTransacting || state.isAuthenticating)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if destination == .activity {
                        TransactionActivityView(state: state)
                    } else if destination == .receive, let account = state.activeAccount {
                        ReceiveAssetsView(evmAddress: account.evmAddress, cosmosAddress: account.cosmosAddress)
                    } else if !state.isUnlocked || destination == .wallet {
                        WalletAccessView(state: state)
                    } else if destination == .send {
                        TransferForm(state: state)
                    } else {
                        SwapForm(state: state)
                    }
                }
                .padding(20)
                .frame(maxWidth: 620)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.zeniSheet)
        .foregroundStyle(.white)
        .tint(.zeniAccent)
        .preferredColorScheme(.dark)
        .presentationBackground(Color.zeniSheet)
        .presentationCornerRadius(28)
        .presentationDragIndicator(.visible)
        .presentationDetents([.large])
        .interactiveDismissDisabled(state.isTransacting || state.isAuthenticating)
    }
}

private struct TransactionSheetHeader: View {
    let destination: TransactionDestination
    let close: () -> Void

    private var icon: String {
        switch destination {
        case .send: "paperplane"
        case .receive: "qrcode"
        case .swap: "arrow.up.arrow.down"
        case .wallet: "wallet.pass"
        case .activity: "clock"
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.subheadline)
                .foregroundStyle(Color.zeniAccent)
                .frame(width: 36, height: 36)
                .background(Color.zeniAccent.opacity(0.15), in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(destination.title).font(.headline)
                if destination == .swap {
                    Text("QoreChain native AMM · Testnet").font(.caption2).foregroundStyle(Color.zeniMuted)
                }
            }
            Spacer(minLength: 8)
            Button(action: close) {
                Image(systemName: "xmark").font(.subheadline)
                    .foregroundStyle(Color.zeniMuted)
                    .frame(width: 44, height: 44)
                    .background(Color.zeniCard, in: Circle())
            }.buttonStyle(.plain).accessibilityLabel("Close")
        }
        .padding(.horizontal, 20).padding(.top, 24).padding(.bottom, 14)
        .overlay(alignment: .bottom) { Color.zeniBorder.frame(height: 1).padding(.horizontal, 20) }
    }
}

private struct ReceiveAssetsView: View {
    let evmAddress: String
    let cosmosAddress: String
    @State private var useNativeAddress = false
    @State private var qrImage: UIImage?

    private var selectedAddress: String { useNativeAddress ? cosmosAddress : evmAddress }

    var body: some View {
        VStack(spacing: 22) {
            Picker("QR address type", selection: $useNativeAddress) {
                Text("EVM").tag(false)
                Text("Native").tag(true)
            }.pickerStyle(.segmented)
            VStack(spacing: 12) {
                if let qrImage {
                    Image(uiImage: qrImage).interpolation(.none).resizable().scaledToFit()
                        .frame(width: 200, height: 200)
                        .padding(14).background(.white, in: RoundedRectangle(cornerRadius: 18))
                        .accessibilityLabel("Receive QR code for " + selectedAddress)
                } else {
                    Text("Use the address below to receive assets.").font(.caption)
                }
                Text(useNativeAddress ? "Native QoreChain address" : "EVM address")
                    .font(.caption).foregroundStyle(Color.zeniMuted)
            }.padding(.vertical, 8)
            ReceiveAddressRow(title: "EVM Address (0x)", address: evmAddress)
            ReceiveAddressRow(title: "Native Address (qor1)", address: cosmosAddress)
            Label("Only send assets on QoreChain Diana Testnet.", systemImage: "checkmark.shield")
                .font(.caption).foregroundStyle(Color.zeniMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .task(id: selectedAddress) {
            let filter = CIFilter.qrCodeGenerator()
            filter.message = Data(selectedAddress.utf8)
            filter.correctionLevel = "M"
            if let output = filter.outputImage,
               let image = CIContext().createCGImage(output, from: output.extent) {
                qrImage = UIImage(cgImage: image)
            } else { qrImage = nil }
        }
    }
}

private struct ReceiveAddressRow: View {
    let title: LocalizedStringKey
    let address: String
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).foregroundStyle(Color.zeniMuted)
                Spacer()
                if copied { Text("Copied!").foregroundStyle(Color.zeniGreen) }
            }.font(.caption)
            Button {
                UIPasteboard.general.string = address
                copied = true
            } label: {
                HStack(spacing: 12) {
                    Text(address).font(.system(.caption, design: .monospaced))
                        .lineLimit(1).truncationMode(.middle)
                    Spacer(minLength: 0)
                    Image(systemName: copied ? "checkmark" : "square.on.square")
                        .foregroundStyle(copied ? Color.zeniGreen : Color.zeniMuted)
                }
                .frame(maxWidth: .infinity, minHeight: 30)
                .padding(12).zeniSurface(.black, radius: 12)
            }.buttonStyle(.plain).accessibilityLabel("Copy address " + address)
        }
        .task(id: copied) {
            if copied {
                try? await Task.sleep(for: .seconds(2))
                copied = false
            }
        }
    }
}

private struct WalletAccessView: View {
    let state: AppState
    @State private var mnemonic = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(spacing: 14) {
                ZeniBrandMark()
                VStack(spacing: 0) {
                    Text("Zeni").font(.system(.largeTitle, design: .default).weight(.black))
                    Text("Wallet").font(.title.weight(.heavy)).foregroundStyle(.white.opacity(0.85))
                }
                Text(state.hasWallet ? "Welcome back" : "The Zen of Web3")
                    .font(.subheadline).foregroundStyle(Color.zeniMuted)
            }.frame(maxWidth: .infinity).padding(.vertical, 24)
            Text(state.hasWallet ? "Your QoreChain wallet" : "Import your wallet")
                .font(.headline)
            if let account = state.activeAccount {
                Text(account.evmAddress).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                Text(account.cosmosAddress).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
            }
            if !state.hasWallet {
                Text("Enter the recovery phrase from your extension wallet. It stays on this device, protected by the Keychain and Face ID or Touch ID.")
                    .font(.subheadline).foregroundStyle(Color.zeniMuted)
                SecureField("Recovery phrase", text: $mnemonic)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(16).transactionCard()
                    .disabled(state.isAuthenticating)
                Text("Use your recovery phrase, not your extension password. Device passcode and enrolled biometrics are required.")
                    .font(.caption).foregroundStyle(Color.zeniMuted)
            }
            if let error { TransactionErrorView(message: error) }
            if let error = state.walletError { TransactionErrorView(message: error) }
            if state.isUnlocked {
                Text("Connected to QoreChain Diana Testnet. Swaps use native bank balances; QOR sends use the EVM lane.")
                    .font(.subheadline).foregroundStyle(Color.zeniMuted)
                Button("Lock Wallet") { state.lock() }
                    .buttonStyle(ZeniPrimaryButtonStyle())
                    .disabled(state.isTransacting)
            } else {
                Button {
                    Task {
                        error = nil
                        do {
                            if state.hasWallet { try await state.unlock() }
                            else {
                                let phrase = mnemonic
                                mnemonic = ""
                                try await state.importWallet(mnemonic: phrase)
                            }
                        } catch { self.error = error.localizedDescription }
                    }
                } label: {
                    HStack {
                        if state.isAuthenticating { ProgressView() }
                        Text(state.hasWallet ? "Unlock Wallet" : "Import Wallet")
                    }.frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(ZeniPrimaryButtonStyle())
                .disabled(state.isAuthenticating || (!state.hasWallet && mnemonic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            }
        }
    }
}

private struct TransferForm: View {
    let state: AppState
    @State private var symbol = "QOR"
    @State private var recipient = ""
    @State private var amount = ""
    @State private var quote: TransferQuote?
    @State private var result: TransactionResult?
    @State private var isWorking = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let result {
                TransactionResultView(result: result)
            } else {
                Text("QoreChain Diana Testnet").font(.caption).foregroundStyle(Color.zeniMuted)
                TransactionAssetPicker(title: "Asset", tokens: state.tokens, symbol: $symbol)
                    .disabled(isWorking || quote != nil)
                if symbol != "QOR" {
                    Text("Only QOR transfers are live. Faucet-token transfers are not supported on iPhone.")
                        .font(.subheadline).foregroundStyle(Color.zeniMuted)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Recipient Address").font(.caption).foregroundStyle(Color.zeniMuted)
                    TextField("0x… or qor1…", text: $recipient)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .font(.system(.subheadline, design: .monospaced))
                        .padding(14).transactionCard()
                }.disabled(isWorking || quote != nil)
                HStack {
                    Text("Amount").font(.caption).foregroundStyle(Color.zeniMuted)
                    Spacer(minLength: 8)
                    Text("Available: \(state.evmQorBalance) QOR")
                        .font(.caption).foregroundStyle(Color.zeniMuted)
                    Spacer()
                    Button("MAX") { prepare(maximum: true) }
                        .disabled(isWorking || quote != nil || symbol != "QOR" || recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .frame(minHeight: 44)
                }
                TransactionAmountField(amount: $amount, symbol: symbol).disabled(isWorking || quote != nil)
                HStack {
                    Label("Network fee", systemImage: "fuelpump")
                        .foregroundStyle(Color.zeniMuted)
                    Spacer()
                    Text(quote.map { $0.maxNetworkFee + " QOR" } ?? "Calculated on review")
                }.font(.caption).padding(14).transactionCard()
                if let error { TransactionErrorView(message: error) }
                if let quote {
                    TransferReview(quote: quote)
                    Button("Edit transfer") { self.quote = nil; error = nil }.disabled(isWorking)
                    QuoteConfirmButton(expiration: quote.expiration, title: "Authorize & Send", isWorking: isWorking) {
                        Task {
                            isWorking = true
                            error = nil
                            defer { isWorking = false }
                            do { result = try await state.execute(quoteID: quote.id, isSwap: false) }
                            catch { self.quote = nil; self.error = error.localizedDescription }
                        }
                    }
                } else {
                    TransactionPrimaryButton(title: "Review Transfer", isWorking: isWorking) { prepare(maximum: false) }
                        .disabled(isWorking || symbol != "QOR" || amount.isEmpty || recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func prepare(maximum: Bool) {
        Task {
            isWorking = true
            error = nil
            defer { isWorking = false }
            do {
                let next = try await state.prepareTransfer(recipient: recipient.trimmingCharacters(in: .whitespacesAndNewlines), amount: maximum ? "MAX" : amount, token: symbol)
                quote = next
                amount = next.amount
            } catch { self.error = error.localizedDescription }
        }
    }
}

private struct TransferReview: View {
    let quote: TransferQuote

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Review transfer").font(.headline)
            TransactionDetail(title: "Amount", value: quote.amount + " QOR")
            Text("Recipient").font(.caption).foregroundStyle(Color.zeniMuted)
            Text(quote.to).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
            TransactionDetail(title: "Maximum network fees", value: quote.maxNetworkFee + " QOR")
            Text("Authorize one transfer to this recipient for \(quote.windowBlocks) blocks, capped at \(quote.authorizationLimit) including transfer gas.")
                .font(.caption)
            if quote.registrationRequired {
                Text("Includes first-time registration of your post-quantum public key.").font(.caption)
            }
            Text("Completed setup fees remain charged if a later step fails.")
                .font(.caption).foregroundStyle(Color.zeniMuted)
        }.padding(16).transactionCard()
    }
}

private struct SwapForm: View {
    let state: AppState
    @State private var tokenIn = "QOR"
    @State private var tokenOut = "fUSD"
    @State private var amount = ""
    @State private var slippageBps = 50
    @State private var quote: SwapQuote?
    @State private var reviewed: SwapQuote?
    @State private var result: TransactionResult?
    @State private var isQuoting = false
    @State private var isWorking = false
    @State private var error: String?
    @State private var requestID = UUID()

    private var inputs: String { "\(tokenIn)|\(tokenOut)|\(amount)|\(slippageBps)|\(reviewed != nil)|\(isWorking)|\(result != nil)" }
    private var activeQuote: SwapQuote? { reviewed ?? quote }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let result {
                TransactionResultView(result: result)
            } else {
                VStack(spacing: 0) {
                    SwapAssetCard(title: "You Pay", tokens: state.tokens, symbol: $tokenIn,
                                  excludedSymbol: tokenOut, amount: $amount,
                                  balance: state.tokens.first(where: { $0.symbol == tokenIn })?.balance ?? "0",
                                  maximumDisabled: isQuoting, maximum: maximum)
                        .disabled(isWorking || reviewed != nil)
                    Button {
                        let previous = tokenIn; tokenIn = tokenOut; tokenOut = previous
                    } label: {
                        Image(systemName: "arrow.up.arrow.down").font(.subheadline)
                            .frame(width: 44, height: 44).zeniSurface(radius: 22)
                    }
                    .buttonStyle(.plain).foregroundStyle(Color.zeniAccent)
                    .accessibilityLabel("Reverse swap direction")
                    .disabled(isWorking || reviewed != nil)
                    .padding(.vertical, -6).zIndex(1)
                    SwapAssetCard(title: "You Receive", tokens: state.tokens, symbol: $tokenOut,
                                  excludedSymbol: tokenIn, amount: .constant(activeQuote?.amountOut ?? "—"),
                                  balance: state.tokens.first(where: { $0.symbol == tokenOut })?.balance ?? "0",
                                  isOutput: true, isQuoting: isQuoting)
                        .disabled(isWorking || reviewed != nil)
                }
                HStack {
                    Label("Slippage tolerance", systemImage: "slider.horizontal.3")
                        .foregroundStyle(Color.zeniMuted)
                    Spacer()
                    Menu {
                        Picker("Slippage tolerance", selection: $slippageBps) {
                            Text("0.1%").tag(10)
                            Text("0.5%").tag(50)
                            Text("1.0%").tag(100)
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Text((Double(slippageBps) / 100).formatted() + "%")
                            Image(systemName: "chevron.down")
                        }.padding(.vertical, 12)
                    }.disabled(isWorking || reviewed != nil)
                }.font(.caption)
                if let error { TransactionErrorView(message: error) }
                if let activeQuote { SwapReview(quote: activeQuote) }
                if let reviewed {
                    Button("Edit / refresh quote") { self.reviewed = nil; quote = nil; error = nil }.disabled(isWorking)
                    QuoteConfirmButton(expiration: reviewed.expiration, title: "Confirm & Swap", isWorking: isWorking) {
                        Task {
                            isWorking = true
                            error = nil
                            defer { isWorking = false }
                            do { result = try await state.execute(quoteID: reviewed.id, isSwap: true) }
                            catch { self.reviewed = nil; quote = nil; self.error = error.localizedDescription }
                        }
                    }
                } else {
                    TransactionPrimaryButton(title: "Review Swap", isWorking: isQuoting || isWorking) {
                        reviewed = quote
                        error = nil
                    }.disabled(quote == nil || isQuoting || isWorking)
                }
            }
        }
        .task(id: inputs) { await refreshQuote() }
    }

    private func refreshQuote() async {
        let id = UUID()
        requestID = id
        guard reviewed == nil, !isWorking, result == nil else { isQuoting = false; return }
        quote = nil
        guard !amount.isEmpty else { isQuoting = false; return }
        isQuoting = true
        do {
            try await Task.sleep(for: .milliseconds(400))
            while !Task.isCancelled {
                do {
                    let next = try await state.prepareSwap(tokenIn: tokenIn, tokenOut: tokenOut, amount: amount, slippageBps: slippageBps)
                    guard requestID == id, !Task.isCancelled else { return }
                    quote = next
                    error = nil
                } catch {
                    guard requestID == id, !Task.isCancelled else { return }
                    quote = nil
                    self.error = error.localizedDescription
                }
                isQuoting = false
                try await Task.sleep(for: .seconds(20))
            }
        } catch { if requestID == id { isQuoting = false } }
    }

    private func maximum() {
        Task {
            isWorking = true
            error = nil
            defer { isWorking = false }
            do {
                let next = try await state.prepareSwap(tokenIn: tokenIn, tokenOut: tokenOut, amount: "MAX", slippageBps: slippageBps)
                amount = next.amountIn
                reviewed = next
            } catch { self.error = error.localizedDescription }
        }
    }
}

private struct SwapReview: View {
    let quote: SwapQuote

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            TransactionDetail(title: "Pool", value: "#" + quote.poolId + " · " + quote.tokenIn + "/" + quote.tokenOut)
            TransactionDetail(title: "Minimum received", value: quote.minAmountOut + " " + quote.tokenOut)
            TransactionDetail(title: "Swap fee (included)", value: quote.swapFee + " " + quote.tokenIn)
            TransactionDetail(title: "Price impact", value: (Double(quote.impactBps) / 100).formatted() + "%")
            TransactionDetail(title: "Maximum network fees", value: quote.maxNetworkFee + " QOR")
            if quote.registrationRequired {
                Text("Includes first-time PQC registration. Completed setup fees remain charged if the swap fails.")
                    .font(.caption).foregroundStyle(Color.zeniMuted)
            }
            Text("Uses native bank balances. Quotes refresh until you review.")
                .font(.caption).foregroundStyle(Color.zeniMuted)
        }.padding(16).transactionCard()
    }
}

private struct QuoteConfirmButton: View {
    let expiration: Date
    let title: LocalizedStringKey
    let isWorking: Bool
    let action: () -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(alignment: .leading, spacing: 10) {
                if context.date >= expiration {
                    Text("Quote expired. Edit and review again.").font(.caption).foregroundStyle(.orange)
                } else {
                    Text("Review expires \(expiration, style: .relative)")
                        .font(.caption).foregroundStyle(Color.zeniMuted)
                }
                TransactionPrimaryButton(title: title, isWorking: isWorking, action: action)
                    .disabled(isWorking || context.date >= expiration)
            }
        }
    }
}

private struct TransactionResultView: View {
    let result: TransactionResult

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Image(systemName: result.status == "CONFIRMED" ? "checkmark.circle" : result.status == "FAILED" ? "xmark.circle" : "clock")
                .font(.largeTitle).foregroundStyle(Color.zeniAccent)
            Text(result.status == "CONFIRMED" ? "Transaction confirmed" : result.status == "FAILED" ? "Transaction failed" : "Transaction pending")
                .font(.title2.bold())
            Text("Stage: \(result.stage)").font(.subheadline)
            if let amount = result.amountOut { Text("Received: \(amount)") }
            if let error = result.error { TransactionErrorView(message: error) }
            Text(result.hash).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
            if let url = URL(string: result.explorerUrl), url.host == "dashboard.qorechain.io" {
                Link("View on Explorer", destination: url).buttonStyle(ZeniPrimaryButtonStyle())
            }
            Text("Select Testnet in the explorer. Activity keeps the transaction status, including any setup transactions.")
                .font(.caption).foregroundStyle(Color.zeniMuted)
        }
    }
}

struct TransactionActivityView: View {
    let state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button { Task { await state.refresh() } } label: {
                Label("Refresh status", systemImage: "arrow.clockwise")
            }.disabled(state.isRefreshing || !state.isUnlocked)
            if let error = state.walletError { TransactionErrorView(message: error) }
            if state.activity.isEmpty {
                ContentUnavailableView("No transactions yet", systemImage: "clock",
                                       description: Text("Your transfers, swaps, and setup transactions will appear here."))
            }
            ForEach(state.activity) { item in
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(item.stage.capitalized).font(.headline)
                        Spacer()
                        Text(item.status).font(.caption.bold())
                            .foregroundStyle(item.status == "FAILED" ? Color.red : Color.zeniGreen)
                    }
                    if let amount = item.amountIn, let token = item.tokenIn {
                        Text("\(amount) \(token)").font(.subheadline)
                    }
                    if let output = item.amountOut { Text("Received: \(output) \(item.tokenOut ?? "")").font(.caption) }
                    if let fee = item.gasCost { Text("Network fees: \(fee)").font(.caption) }
                    if let error = item.error { TransactionErrorView(message: error) }
                    Text(item.hash).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                    if let url = item.explorerURL { Link("View on Explorer", destination: url) }
                }.padding(16).transactionCard()
            }
        }
    }
}

private struct TransactionTokenMenu: View {
    let tokens: [TokenItem]
    @Binding var symbol: String
    var excludedSymbol: String? = nil
    var expanded = false

    var body: some View {
        Menu {
            ForEach(tokens) { token in
                Button {
                    symbol = token.symbol
                } label: {
                    Label(token.symbol + " · " + token.name,
                          systemImage: symbol == token.symbol ? "checkmark.circle.fill" : "circle")
                }.disabled(token.symbol == excludedSymbol)
            }
        } label: {
            HStack(spacing: 8) {
                ZeniTokenIcon(symbol: symbol, size: expanded ? 32 : 24)
                VStack(alignment: .leading, spacing: 3) {
                    Text(symbol).font(.subheadline.bold())
                    if expanded {
                        Text(tokens.first(where: { $0.symbol == symbol })?.name ?? symbol)
                            .font(.caption2).foregroundStyle(Color.zeniMuted)
                    }
                }
                if expanded { Spacer(minLength: 8) }
                Image(systemName: "chevron.down").font(.caption2).foregroundStyle(Color.zeniMuted)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .zeniSurface(expanded ? .black : .zeniCard)
        }.accessibilityLabel("Select token, " + symbol)
    }
}

private struct TransactionAssetPicker: View {
    let title: LocalizedStringKey
    let tokens: [TokenItem]
    @Binding var symbol: String
    var excludedSymbol: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption).foregroundStyle(Color.zeniMuted)
            TransactionTokenMenu(tokens: tokens, symbol: $symbol, excludedSymbol: excludedSymbol, expanded: true)
        }
    }
}

private struct SwapAssetCard: View {
    let title: LocalizedStringKey
    let tokens: [TokenItem]
    @Binding var symbol: String
    let excludedSymbol: String
    @Binding var amount: String
    let balance: String
    var isOutput = false
    var isQuoting = false
    var maximumDisabled = false
    var maximum: (() -> Void)? = nil
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                Spacer(minLength: 8)
                Text("Balance: " + balance).multilineTextAlignment(.trailing)
                if let maximum {
                    Button("MAX", action: maximum).fontWeight(.semibold)
                        .foregroundStyle(Color.zeniAccent).disabled(maximumDisabled)
                        .padding(.vertical, 8)
                }
            }.font(.caption).foregroundStyle(Color.zeniMuted)
            let layout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
            layout {
                if isOutput {
                    HStack {
                        Text(amount).fixedSize(horizontal: false, vertical: true)
                        if isQuoting { ProgressView() }
                    }
                    .font(.system(.title2, design: .monospaced).bold())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel("Estimated output " + amount + " " + symbol)
                } else {
                    TextField("0.00", text: $amount).keyboardType(.decimalPad)
                        .font(.system(.title2, design: .monospaced).bold())
                        .accessibilityLabel("Amount to swap")
                }
                TransactionTokenMenu(tokens: tokens, symbol: $symbol, excludedSymbol: excludedSymbol)
            }
        }.padding(16).zeniSurface(.black)
    }
}

private struct TransactionAmountField: View {
    @Binding var amount: String
    let symbol: String

    var body: some View {
        HStack {
            TextField("0.00", text: $amount).keyboardType(.decimalPad)
                .font(.system(.title3, design: .monospaced)).accessibilityLabel("Amount")
            Text(symbol).font(.subheadline)
        }.padding(16).zeniSurface(.black, radius: 12)
    }
}

private struct TransactionDetail: View {
    let title: LocalizedStringKey
    let value: String

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                Text(title).foregroundStyle(Color.zeniMuted)
                Spacer(minLength: 16)
                Text(value)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(title).foregroundStyle(Color.zeniMuted)
                Text(value)
            }
        }.font(.caption)
    }
}

private struct TransactionPrimaryButton: View {
    let title: LocalizedStringKey
    let isWorking: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                if isWorking { ProgressView().tint(.white) }
                else { Image(systemName: "checkmark.shield") }
                Text(title)
            }.frame(maxWidth: .infinity, minHeight: 44)
        }.buttonStyle(ZeniPrimaryButtonStyle())
    }
}

private struct TransactionErrorView: View {
    let message: String
    var body: some View {
        Text(message).font(.caption).foregroundStyle(.red)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14).transactionCard()
    }
}

private extension View {
    func transactionCard() -> some View {
        background(Color.zeniCard, in: RoundedRectangle(cornerRadius: 16))
            .overlay { RoundedRectangle(cornerRadius: 16).stroke(Color.zeniBorder, lineWidth: 1) }
    }
}

#Preview("Wallet access") {
    WalletTransactionSheet(state: AppState(), destination: .wallet)
}

#Preview("Swap review") {
    ScrollView {
        SwapReview(quote: SwapQuote(
            id: "preview", tokenIn: "QOR", tokenOut: "fUSD", poolId: "2",
            amountIn: "1.0", amountOut: "0.081062", minAmountOut: "0.080656",
            swapFee: "0.003", impactBps: 2, slippageBps: 50, registrationRequired: true,
            maxNetworkFee: "0.18", expiresAt: Date.now.addingTimeInterval(120).timeIntervalSince1970 * 1000
        )).padding(20)
    }
    .background(Color.zeniBackground)
    .preferredColorScheme(.dark)
}

#Preview("Home") {
    PortfolioView(state: AppState())
}

#Preview("Swap") {
    VStack(spacing: 0) {
        TransactionSheetHeader(destination: .swap) {}
        ScrollView { SwapForm(state: AppState()).padding(20) }
    }
    .background(Color.zeniSheet).tint(.zeniAccent).preferredColorScheme(.dark)
}

#Preview("Send") {
    VStack(spacing: 0) {
        TransactionSheetHeader(destination: .send) {}
        ScrollView { TransferForm(state: AppState()).padding(20) }
    }
    .background(Color.zeniSheet).tint(.zeniAccent).preferredColorScheme(.dark)
}

#Preview("Receive") {
    ScrollView {
        ReceiveAssetsView(evmAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
                          cosmosAddress: "qor17w0adeg64ky0daxwd2ugyuneellmjgnxf70wvl").padding(20)
    }
    .background(Color.zeniSheet).preferredColorScheme(.dark)
}

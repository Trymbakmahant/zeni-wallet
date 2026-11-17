import SwiftUI
import UIKit

private enum WalletTab: String, CaseIterable, Identifiable {
    case home = "Home", activity = "Activity", settings = "Settings"
    var id: Self { self }
    var icon: String {
        switch self {
        case .home: "house"
        case .activity: "clock"
        case .settings: "gearshape"
        }
    }
}

public struct PortfolioView: View {
    let state: AppState
    @State private var destination: TransactionDestination?
    @State private var tab: WalletTab = .home

    public init(state: AppState) { self.state = state }

    public var body: some View {
        @Bindable var connection = state.connect
        VStack(spacing: 0) {
            WalletHeader(state: state) { destination = .wallet }
            Button { connection.isPresented = true } label: {
                Label(connection.connected == nil ? "Connect a web app" : "Connected web app", systemImage: "qrcode.viewfinder")
                    .font(.caption).frame(maxWidth: .infinity).padding(.vertical, 10)
            }
            Rectangle().fill(Color.zeniBorder).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch tab {
                    case .home:
                        WalletHome(state: state) { destination = $0 }
                    case .activity:
                        Text("Activity").font(.title3.bold())
                        TransactionActivityView(state: state)
                    case .settings:
                        WalletSettings(state: state) { destination = .wallet }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .frame(maxWidth: 620)
                .frame(maxWidth: .infinity, alignment: .top)
            }
            .refreshable { await state.refresh() }
            WalletBottomNavigation(selection: $tab)
        }
        .background(Color.zeniBackground.ignoresSafeArea())
        .foregroundStyle(.white)
        .tint(.zeniAccent)
        .preferredColorScheme(.dark)
        .sheet(item: $destination) { selection in
            WalletTransactionSheet(state: state, destination: selection)
        }
        .sheet(isPresented: $connection.isPresented) { ZeniConnectView(state: state, controller: connection) }
        .task { await state.refresh() }
    }
}

private struct WalletHeader: View {
    let state: AppState
    let openWallet: () -> Void
    @State private var copied = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
        layout {
            VStack(alignment: .leading, spacing: 4) {
                Button(action: openWallet) {
                    HStack(spacing: 6) {
                        Text(state.hasWallet ? "Account 1" : "Your Wallet").font(.subheadline.bold())
                        Image(systemName: "chevron.down").font(.caption2).foregroundStyle(Color.zeniMuted)
                    }
                }.buttonStyle(.plain)
                Button {
                    if let address = state.activeAccount?.evmAddress {
                        UIPasteboard.general.string = address
                        copied = true
                    } else { openWallet() }
                } label: {
                    HStack(spacing: 6) {
                        Circle().fill(state.isUnlocked ? Color.zeniGreen : Color.zeniMuted).frame(width: 6, height: 6)
                        if let address = state.activeAccount?.evmAddress {
                            Text(copied ? "Copied!" : "\(address.prefix(6))…\(address.suffix(4))")
                            Image(systemName: copied ? "checkmark" : "square.on.square")
                        } else {
                            Text("Import wallet")
                            Image(systemName: "arrow.down.to.line")
                        }
                    }
                    .font(.system(.caption2, design: .monospaced))
                    .lineLimit(1)
                    .foregroundStyle(Color.zeniMuted)
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .zeniSurface(radius: 20)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(state.hasWallet ? "Copy account address" : "Import wallet")
                .task(id: copied) {
                    if copied {
                        try? await Task.sleep(for: .seconds(2))
                        copied = false
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 10) {
                Label(state.isUnlocked ? "PQC Ready" : "PQC Wallet", systemImage: "checkmark.shield")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(Color.zeniAccent)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(Color.zeniAccent.opacity(0.12), in: Capsule())
                    .overlay { Capsule().stroke(Color.zeniAccent.opacity(0.3), lineWidth: 1) }
                Button {
                    if state.isUnlocked { state.lock() } else { openWallet() }
                } label: {
                    Image(systemName: "lock").font(.subheadline)
                        .frame(width: 44, height: 44).zeniSurface(radius: 12)
                }
                .buttonStyle(.plain)
                .disabled(state.isTransacting)
                .accessibilityLabel(state.isUnlocked ? "Lock wallet" : "Unlock wallet")
            }
            .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
    }
}

private struct WalletHome: View {
    let state: AppState
    let open: (TransactionDestination) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            WalletBalanceHero(isUnlocked: state.isUnlocked)
            let layout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                WalletActionTile(title: "Send", icon: "arrow.up.right") { open(.send) }
                WalletActionTile(title: "Receive", icon: "arrow.down.left") { open(.receive) }
                WalletActionTile(title: "Swap", icon: "arrow.up.arrow.down") { open(.swap) }
            }
            FaucetCard()
            if let error = state.walletError {
                Text(error).font(.caption).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
            }
            WalletAssets(state: state, open: open)
        }
    }
}

private struct WalletBalanceHero: View {
    let isUnlocked: Bool
    @ScaledMetric(relativeTo: .largeTitle) private var balanceSize = 42

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Diana test assets have no reliable USD price feed.
            Text("$—").font(.system(size: balanceSize, weight: .bold)).tracking(-1.5)
                .accessibilityLabel("Portfolio value unavailable")
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    Text(isUnlocked ? "Testnet assets" : "Unlock to view balances").foregroundStyle(Color.zeniGreen)
                    Text("·").foregroundStyle(Color.zeniMuted)
                    Label("ML-DSA-87", systemImage: "sparkles").foregroundStyle(Color.zeniMuted)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(isUnlocked ? "Testnet assets" : "Unlock to view balances").foregroundStyle(Color.zeniGreen)
                    Label("ML-DSA-87", systemImage: "sparkles").foregroundStyle(Color.zeniMuted)
                }
            }.font(.system(.caption, design: .monospaced))
        }.padding(.vertical, 4)
    }
}

private struct WalletActionTile: View {
    let title: LocalizedStringKey
    let icon: String
    let action: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: action) {
            let layout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(HStackLayout(spacing: 12)) : AnyLayout(VStackLayout(spacing: 9))
            layout {
                Image(systemName: icon).font(.system(size: 21, weight: .medium))
                Text(title).font(.subheadline.weight(.semibold))
            }
            .frame(maxWidth: .infinity).padding(.vertical, 15)
            .zeniSurface()
        }.buttonStyle(.plain)
    }
}

private struct FaucetCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
        layout {
            VStack(alignment: .leading, spacing: 6) {
                let titleLayout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(spacing: 6))
                titleLayout {
                    Text("Diana Faucet").font(.subheadline.bold())
                    Text("Testnet").font(.caption2)
                        .foregroundStyle(Color.zeniAccent)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(Color.zeniAccent.opacity(0.1), in: Capsule())
                }
                Text("Claim testnet QOR & tokens")
                    .font(.system(.caption, design: .monospaced)).foregroundStyle(Color.zeniMuted)
            }
            Spacer(minLength: 0)
            if let url = URL(string: "https://dashboard.qorechain.io/faucet") {
                Link(destination: url) {
                    Text("Claim").font(.caption.bold()).foregroundStyle(.black)
                        .padding(.horizontal, 17).frame(minHeight: 44)
                        .background(.white, in: Capsule())
                }
            }
        }.padding(15).zeniSurface(Color.zeniSheet)
    }
}

private enum AssetTab: String, CaseIterable, Identifiable {
    case tokens = "Tokens", defi = "DeFi", nfts = "NFTs"
    var id: Self { self }
}

private struct WalletAssets: View {
    let state: AppState
    let open: (TransactionDestination) -> Void
    @State private var selection: AssetTab = .tokens

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 26) {
                ForEach(AssetTab.allCases) { tab in
                    Button { selection = tab } label: {
                        Text(tab.rawValue).font(.subheadline.weight(.semibold))
                            .foregroundStyle(selection == tab ? .white : Color.zeniMuted)
                            .padding(.vertical, 13)
                            .overlay(alignment: .bottom) {
                                if selection == tab { Capsule().fill(.white).frame(height: 2) }
                            }
                    }.buttonStyle(.plain).accessibilityAddTraits(selection == tab ? .isSelected : [])
                }
                Spacer(minLength: 0)
            }.overlay(alignment: .bottom) { Color.zeniBorder.frame(height: 0.5) }
            if selection == .tokens {
                HStack {
                    HStack(spacing: 6) {
                        Circle().fill(Color.zeniGreen).frame(width: 6, height: 6)
                        Text("QoreChain Diana").font(.caption)
                    }.padding(.horizontal, 10).padding(.vertical, 7).zeniSurface(radius: 20)
                    Spacer()
                    Button { Task { await state.refresh() } } label: {
                        Image(systemName: "arrow.clockwise").font(.subheadline)
                            .foregroundStyle(state.isRefreshing ? Color.zeniAccent : Color.zeniMuted)
                            .frame(width: 44, height: 44)
                    }.buttonStyle(.plain).disabled(state.isRefreshing || !state.isUnlocked)
                        .accessibilityLabel("Refresh balances")
                }
                VStack(spacing: 0) {
                    ForEach(state.tokens) { token in
                        Button { open(token.symbol == "QOR" ? .send : .swap) } label: {
                            WalletTokenRow(token: token, isUnlocked: state.isUnlocked)
                        }.buttonStyle(.plain)
                    }
                }
            } else {
                VStack(spacing: 10) {
                    Image(systemName: selection == .defi ? "chart.bar.xaxis" : "photo.on.rectangle.angled")
                        .font(.title2).foregroundStyle(Color.zeniMuted)
                    Text(selection == .defi ? "DeFi positions" : "Your NFTs").font(.subheadline.bold())
                    Text(selection == .defi ? "DeFi position tracking is not available yet." : "NFT collection tracking is not available yet.")
                        .font(.caption).foregroundStyle(Color.zeniMuted)
                }.frame(maxWidth: .infinity).multilineTextAlignment(.center).padding(.vertical, 36)
            }
        }
    }
}

private struct WalletTokenRow: View {
    let token: TokenItem
    let isUnlocked: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZeniTokenIcon(symbol: token.symbol, size: 40)
                .overlay(alignment: .bottomTrailing) {
                    Circle().fill(Color.zeniAccent).frame(width: 6, height: 6)
                        .padding(4).background(.black, in: Circle())
                        .overlay { Circle().stroke(Color.zeniBorder, lineWidth: 1) }.offset(x: 2, y: 2)
                }
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 4) {
                    Text(token.name).font(.subheadline.bold())
                    Image(systemName: "checkmark.seal").font(.caption).foregroundStyle(Color.zeniAccent)
                }
                Text(token.symbol).font(.system(.caption, design: .monospaced)).foregroundStyle(Color.zeniMuted)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 5) {
                Text(isUnlocked ? token.balance : "—").font(.system(.subheadline, design: .monospaced).weight(.semibold))
                Text(token.symbol).font(.system(.caption2, design: .monospaced)).foregroundStyle(Color.zeniMuted)
            }
        }
        .padding(.vertical, 9).padding(.horizontal, 2)
        .overlay(alignment: .bottom) { Color.zeniBorder.opacity(0.6).frame(height: 0.5) }
        .accessibilityElement(children: .combine)
    }
}

private struct WalletBottomNavigation: View {
    @Binding var selection: WalletTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(WalletTab.allCases) { tab in
                Button { selection = tab } label: {
                    VStack(spacing: 7) {
                        Image(systemName: tab.icon).font(.system(size: 19, weight: .medium))
                            .foregroundStyle(selection == tab ? Color.zeniAccent : Color.zeniMuted)
                        Text(tab.rawValue).font(.caption.weight(selection == tab ? .semibold : .regular))
                            .foregroundStyle(selection == tab ? .white : Color.zeniMuted)
                    }.frame(maxWidth: .infinity, minHeight: 62)
                }.buttonStyle(.plain).accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(.top, 8)
        .background(Color.zeniBackground)
        .overlay(alignment: .top) { Color.zeniBorder.frame(height: 1) }
    }
}

private struct WalletSettings: View {
    let state: AppState
    let openWallet: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Wallet & Security Settings").font(.title3.bold())
            VStack(alignment: .leading, spacing: 12) {
                Label("Post-Quantum Defense", systemImage: "checkmark.shield")
                    .font(.subheadline.bold()).foregroundStyle(Color.zeniAccent)
                Text("Transfers and swaps use QoreChain’s post-quantum authorization. Your recovery phrase is protected on this iPhone with device authentication.")
                    .font(.caption).foregroundStyle(Color.zeniMuted)
            }.padding(18).zeniSurface(.zeniSheet)
            VStack(alignment: .leading, spacing: 16) {
                Text("Active Network").font(.subheadline.bold())
                LabeledContent("Chain", value: "QoreChain Diana Testnet")
                LabeledContent("Chain ID", value: "9800")
                Text("https://evm-testnet.qore.host")
                    .font(.system(.caption, design: .monospaced)).foregroundStyle(Color.zeniAccent)
            }.font(.caption).padding(18).zeniSurface(.zeniSheet)
            Button(action: openWallet) {
                Label(state.hasWallet ? "Manage Wallet" : "Import Wallet", systemImage: "wallet.pass")
            }.buttonStyle(ZeniPrimaryButtonStyle())
            if state.isUnlocked {
                Button { state.lock() } label: {
                    Label("Lock Zeni Wallet", systemImage: "lock")
                        .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 50).zeniSurface()
                }.buttonStyle(.plain).disabled(state.isTransacting)
            }
            if let url = URL(string: "https://dashboard.qorechain.io/explorer") {
                Link(destination: url) {
                    Label("Open QoreChain Explorer", systemImage: "arrow.up.right.square").font(.subheadline)
                }.padding(.vertical, 8)
            }
        }
    }
}

#Preview("Extension-style wallet") {
    PortfolioView(state: AppState())
}

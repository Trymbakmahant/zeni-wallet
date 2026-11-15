import SwiftUI

public struct PortfolioView: View {
    @ObservedObject var state: AppState

    public init(state: AppState) {
        self.state = state
    }

    public var body: some View {
        ZStack {
            Color.zeniBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    HStack {
                        HStack(spacing: 8) {
                            Text("銭")
                                .font(.headline)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                                .frame(width: 32, height: 32)
                                .background(
                                    LinearGradient(
                                        colors: [.zeniPurple, .zeniCyan],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .cornerRadius(10)

                            VStack(alignment: .leading, spacing: 2) {
                                Text("Zeni")
                                    .font(.subheadline)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                Text("Chain ID 9800")
                                    .font(.caption2)
                                    .foregroundColor(.zeniMuted)
                            }
                        }

                        Spacer()

                        // Address Pill
                        if let account = state.activeAccount {
                            Text("\(account.evmAddress.prefix(6))...\(account.evmAddress.suffix(4))")
                                .font(.system(.caption, design: .monospaced))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.zeniCard)
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(Color.zeniBorder, lineWidth: 1)
                                )
                                .foregroundColor(.white)
                        }
                    }
                    .padding(.horizontal)

                    // Total Balance Card
                    VStack(alignment: .leading, spacing: 8) {
                        Text("TOTAL BALANCE")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.zeniMuted)

                        Text("$9,640.00")
                            .font(.system(size: 36, weight: .heavy, design: .rounded))
                            .foregroundColor(.white)

                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color.zeniCyan)
                                .frame(width: 6, height: 6)
                            Text("ML-DSA-87 Quantum Vault Protected")
                                .font(.caption2)
                                .foregroundColor(.zeniCyan)
                        }
                        .padding(.top, 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(24)
                    .background(Color.zeniCard)
                    .cornerRadius(24)
                    .overlay(
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(Color.zeniBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)

                    // Assets List
                    VStack(alignment: .leading, spacing: 12) {
                        Text("ASSETS")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.zeniMuted)
                            .padding(.horizontal)

                        ForEach(state.tokens) { token in
                            HStack {
                                Text(token.icon)
                                    .font(.title2)
                                    .frame(width: 44, height: 44)
                                    .background(Color.zeniBackground)
                                    .cornerRadius(12)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(token.symbol)
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.white)
                                    Text(token.name)
                                        .font(.caption2)
                                        .foregroundColor(.zeniMuted)
                                }

                                Spacer()

                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(token.balance)
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.white)
                                    Text(token.usdValue)
                                        .font(.caption2)
                                        .foregroundColor(.zeniMuted)
                                }
                            }
                            .padding(16)
                            .background(Color.zeniCard)
                            .cornerRadius(16)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(Color.zeniBorder, lineWidth: 1)
                            )
                            .padding(.horizontal)
                        }
                    }
                }
                .padding(.vertical)
            }
        }
    }
}

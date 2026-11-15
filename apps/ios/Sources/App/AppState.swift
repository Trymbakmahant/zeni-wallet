import SwiftUI
import Combine

public struct TokenItem: Identifiable, Equatable {
    public let id = UUID()
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

public final class AppState: ObservableObject {
    @Published public var activeAccount: PublicAccountInfo?
    @Published public var isUnlocked: Bool = false
    @Published public var tokens: [TokenItem] = [
        TokenItem(symbol: "QOR", name: "QoreChain Native", balance: "0.00", usdValue: "$0.00", icon: "💎"),
        TokenItem(symbol: "fUSD", name: "Faucet USD", balance: "0.00", usdValue: "$0.00", icon: "💵"),
        TokenItem(symbol: "fETH", name: "Faucet Ethereum", balance: "0.0000", usdValue: "$0.00", icon: "Ξ"),
        TokenItem(symbol: "fBTC", name: "Faucet Bitcoin", balance: "0.0000", usdValue: "$0.00", icon: "₿")
    ]

    public init() {
        self.activeAccount = PublicAccountInfo(
            evmAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
            cosmosAddress: "qor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq23m4x",
            pqcPublicKeyHex: "0x9f83e201...",
            pqcPublicKeyHashHex: "0x4b78...9012"
        )
    }
}

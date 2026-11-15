import Foundation
import CryptoKit

public struct PublicAccountInfo: Codable, Equatable {
    public let evmAddress: String
    public let cosmosAddress: String
    public let pqcPublicKeyHex: String
    public let pqcPublicKeyHashHex: String

    public init(evmAddress: String, cosmosAddress: String, pqcPublicKeyHex: String, pqcPublicKeyHashHex: String) {
        self.evmAddress = evmAddress
        self.cosmosAddress = cosmosAddress
        self.pqcPublicKeyHex = pqcPublicKeyHex
        self.pqcPublicKeyHashHex = pqcPublicKeyHashHex
    }
}

public final class KeyDerivation {
    /// Normalizes mnemonic text strictly using Unicode NFKD and collapses all whitespace
    public static func normalizeMnemonic(_ raw: String) -> String {
        let mutable = NSMutableString(string: raw)
        CFStringNormalize(mutable as CFMutableString, .KD)
        let words = (mutable as String)
            .lowercased()
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
        return words.joined(separator: " ")
    }
}

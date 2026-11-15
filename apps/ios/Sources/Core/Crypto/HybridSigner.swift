import Foundation

public struct CompositeSignature {
    public let classicalSignature: Data   // 65 bytes secp256k1
    public let pqcSignature: Data         // ML-DSA-87 signature
    public let pqcPublicKey: Data         // ML-DSA-87 public key

    public init(classicalSignature: Data, pqcSignature: Data, pqcPublicKey: Data) {
        self.classicalSignature = classicalSignature
        self.pqcSignature = pqcSignature
        self.pqcPublicKey = pqcPublicKey
    }
}

public final class HybridSigner {
    /// Combines classical and post-quantum signatures for UserOp submission
    public static func packCompositeSignature(_ sig: CompositeSignature) -> Data {
        var payload = Data()
        payload.append(sig.classicalSignature)
        payload.append(sig.pqcSignature)
        payload.append(sig.pqcPublicKey)
        return payload
    }
}

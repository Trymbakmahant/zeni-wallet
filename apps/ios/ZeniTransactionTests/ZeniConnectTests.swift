import Foundation
import Testing
@testable import Zeni

@Suite(.serialized)
@MainActor
struct ZeniConnectTests {
    // Public fixtures only; these keys and signatures never control funded accounts.
    private let uri = "zeni://connect#v=1&relay=https%3A%2F%2Frelay.example&session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&token=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc&key=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc"
    @Test func webCryptoCiphertextDecryptsWithCryptoKit() throws {
        let pairing = try ConnectPairing(uri: uri)
        let frame = ConnectFrame(id: "bf5664ab-5299-41bc-b782-2e4640f41779", iv: "PggTJPaKTtJORMUu", ciphertext: "EYa6qC6I80p82feDxfSrXq8HuhWJ5I2HGT062dg-Bt0RJnB_VYsn5koh1pL-52xuZEDYA6jfHhu9WfMmxYy1gCozZC3tnqC6djlWyW7oBNDLLWgoCA_r-Z03-wNdO77HbnYdTP9R5_3i3C-C9gReCDuePbrdudHE8e_3a2OWg5xNNtGGfpWee-NmZ2bPczaeniCCZJN-zSQAflGlFa1lNRLOVJcU1oMwfKhNd21QgBHgD2cYoiSjdhjP9AjiaZM0dQnu_Qnx6SnITu5EY7M")
        let decoded = try ConnectCipher.open(frame, pairing: pairing)
        #expect(decoded["type"] as? String == "request")
        #expect((decoded["request"] as? [String: Any])?["method"] as? String == "personal_sign")
        #expect(throws: (any Error).self) { try ConnectCipher.open(frame, pairing: pairing, role: "wallet") }
        let changed = ConnectFrame(id: UUID().uuidString.lowercased(), iv: frame.iv, ciphertext: frame.ciphertext)
        #expect(throws: (any Error).self) { try ConnectCipher.open(changed, pairing: pairing) }
        let response = try ConnectCipher.seal(["type": "disconnect"], pairing: pairing)
        #expect(try ConnectCipher.open(response, pairing: pairing, role: "wallet")["type"] as? String == "disconnect")
    }
    @Test func invalidPairingURIsAreRejected() {
        for invalid in ["https://example.com", uri.replacingOccurrences(of: "https%3A%2F%2Frelay.example", with: "http%3A%2F%2Fevil.example"), uri + "&key=duplicate"] {
            #expect(throws: (any Error).self) { try ConnectPairing(uri: invalid) }
        }
    }
    @Test func reviewedMessageSignsLocallyAndReviewCannotBeReplayed() async throws {
        let engine = WalletTransactionEngine()
        defer { engine.lock() }
        let account: PublicAccountInfo = try await engine.call("unlock", payload: ["mnemonic": "test test test test test test test test test test test junk"])
        let review: DappReview = try await engine.call("prepareDapp", payload: ["method": "personal_sign", "params": ["0x6869", account.evmAddress]])
        #expect(review.message == "hi")
        let signature: String = try await engine.call("signDappMessage", payload: ["reviewId": review.reviewId])
        #expect(signature == "0x391170eff11e409daa3255919c45e25593a40a52475d2a84c8dca1ff5ff1d38d51079619191ba2d5503d0caa32049acbfce5771dca9932197e91f517884b1db11c")
        do {
            let _: String = try await engine.call("signDappMessage", payload: ["reviewId": review.reviewId])
            Issue.record("A consumed message review was replayed")
        } catch { #expect(error.localizedDescription.contains("expired")) }
    }
    @Test func lockingInvalidatesMessageApproval() async throws {
        let engine = WalletTransactionEngine()
        let account: PublicAccountInfo = try await engine.call("unlock", payload: ["mnemonic": "test test test test test test test test test test test junk"])
        let review: DappReview = try await engine.call("prepareDapp", payload: ["method": "personal_sign", "params": ["0x6869", account.evmAddress]])
        let _: Bool = try await engine.call("lock")
        do {
            let _: String = try await engine.call("signDappMessage", payload: ["reviewId": review.reviewId])
            Issue.record("Locked wallet signed a message")
        } catch { #expect(error.localizedDescription.contains("Unlock")) }
    }
    @Test func nativeMailboxRotatesCredentialsAndPostsOnlyCiphertext() async throws {
        let pairing = try ConnectPairing(uri: uri)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ConnectTestProtocol.self]
        ConnectTestProtocol.pairing = pairing
        ConnectTestProtocol.activated = false
        ConnectTestProtocol.posted = false
        let mailbox = ConnectMailbox(pairing: pairing, configuration: config)
        defer { mailbox.cancel() }
        let info = try await mailbox.info()
        #expect(info.origin == "https://app.example")
        let approved = try await mailbox.info(activate: true)
        #expect(approved.active)
        try await mailbox.send(["type": "response", "id": "test", "result": "signed-result"])
        #expect(ConnectTestProtocol.posted)
        let poll = try await mailbox.poll(after: 0)
        #expect(poll.messages.isEmpty)
    }

}


private final class ConnectTestProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var pairing: ConnectPairing?
    nonisolated(unsafe) static var activated = false
    nonisolated(unsafe) static var posted = false
    static let sessionToken = String(repeating: "A", count: 43)
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let pairing = try #require(Self.pairing)
            let authorization = request.value(forHTTPHeaderField: "Authorization")
            #expect(authorization == "Bearer " + (Self.activated ? Self.sessionToken : pairing.token))
            let path = request.url!.path
            var result: [String: Any] = ["id": pairing.session, "origin": "https://app.example", "name": "Example", "expiresAt": 2000000000000.0, "active": Self.activated]
            if path.hasSuffix("/activate") {
                Self.activated = true
                result["active"] = true
                result["walletToken"] = Self.sessionToken
            } else if path.hasSuffix("/messages"), request.httpMethod == "POST" {
                var body = request.httpBody ?? Data()
                if let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var buffer = [UInt8](repeating: 0, count: 4096)
                    while stream.hasBytesAvailable {
                        let count = stream.read(&buffer, maxLength: buffer.count)
                        if count <= 0 { break }; body.append(buffer, count: count)
                    }
                }
                let frame = try JSONDecoder().decode(ConnectFrame.self, from: body)
                #expect(!String(decoding: body, as: UTF8.self).contains("signed-result"))
                let message = try ConnectCipher.open(frame, pairing: pairing, role: "wallet")
                #expect(message["result"] as? String == "signed-result")
                Self.posted = true; result = ["ok": true]
            } else if path.hasSuffix("/messages") { result = ["messages": [], "expiresAt": 2000000000000.0] }
            let data = try JSONSerialization.data(withJSONObject: result)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

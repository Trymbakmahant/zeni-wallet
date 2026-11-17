import Foundation
import Testing
@testable import Zeni

@Suite(.serialized)
@MainActor
struct ZeniConnectedAppsTests {
    @Test func sessionsKeepRequestsIsolatedAndNeverSignOnReceipt() async throws {
        let account = PublicAccountInfo(evmAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", cosmosAddress: "qor1fixture", pqcPublicKeyHex: "", pqcPublicKeyHashHex: "")
        let state = AppState(account: account, engine: WalletTransactionEngine(), signingKeyLoader: { _ in
            Issue.record("Connecting and receiving requests must not access signing keys")
            throw CancellationError()
        })
        let manager = ZeniConnectController(state: state) { pairing in
            let config = URLSessionConfiguration.ephemeral
            config.protocolClasses = [MultiAppRelay.self]
            MultiAppRelay.register(pairing)
            return ConnectMailbox(pairing: pairing, configuration: config)
        }
        let firstURI = uri("a"), secondURI = uri("b")
        await manager.pair(firstURI)
        let first = try #require(manager.selected)
        await first.approveConnection()
        await manager.pair(secondURI)
        let second = try #require(manager.selected)
        await second.approveConnection()
        #expect(manager.connectedApps.count == 2)
        #expect(first.connected?.id != second.connected?.id)
        await manager.pair(firstURI)
        #expect(manager.sessions.count == 2)
        #expect(manager.error?.contains("already") == true)
        manager.isPresented = false
        let firstRequest = try MultiAppRelay.enqueue(String(repeating: "a", count: 32), account: account.evmAddress)
        try await wait { first.pending != nil }
        #expect(manager.isPresented)
        #expect(manager.selectedID == first.id)
        let secondRequest = try MultiAppRelay.enqueue(String(repeating: "b", count: 32), account: account.evmAddress)
        try await wait { second.pending != nil }
        #expect(manager.selectedID == first.id) // Another app cannot replace the current review.
        #expect(manager.pendingCount == 2)
        #expect(first.pending?.id == firstRequest)
        #expect(second.pending?.id == secondRequest)
        #expect(first.review == nil && second.review == nil)
        await first.rejectRequest()
        #expect(first.history.first?.status == "Rejected")
        #expect(second.pending?.id == secondRequest)
        #expect(MultiAppRelay.responseIDs(String(repeating: "a", count: 32)) == [firstRequest])
        #expect(MultiAppRelay.responseIDs(String(repeating: "b", count: 32)).isEmpty)
        await first.disconnect()
        #expect(manager.connectedApps.count == 1)
        manager.presentNextPending()
        #expect(manager.selectedID == second.id)
        await second.rejectRequest()
        await second.disconnect()
        #expect(manager.sessions.isEmpty)
    }

    private func uri(_ digit: String) -> String {
        "zeni://connect#v=1&relay=https%3A%2F%2Frelay.example&session=" + String(repeating: digit, count: 32)
        + "&token=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc&key=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc"
    }
    private func wait(_ condition: () -> Bool) async throws {
        for _ in 0..<80 {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(50))
        }
        Issue.record("Timed out waiting for the isolated relay request")
    }
}

private final class MultiAppRelay: URLProtocol, @unchecked Sendable {
    private struct Session {
        let pairing: ConnectPairing
        var active = false
        var messages: [[String: Any]] = []
        var responses: [String] = []
    }
    private static let lock = NSLock()
    nonisolated(unsafe) private static var sessions: [String: Session] = [:]
    static func register(_ pairing: ConnectPairing) {
        lock.lock(); defer { lock.unlock() }
        sessions[pairing.session] = Session(pairing: pairing)
    }
    static func enqueue(_ id: String, account: String) throws -> String {
        lock.lock(); defer { lock.unlock() }
        let session = try #require(sessions[id])
        let requestID = UUID().uuidString
        let frame = try ConnectCipher.seal(["type": "request", "request": ["id": requestID, "method": "personal_sign", "params": ["0x6869", account]], "expiresAt": Date.now.timeIntervalSince1970 * 1000 + 300000], pairing: session.pairing, role: "dapp")
        sessions[id]?.messages.append(["sequence": session.messages.count + 1, "frame": try JSONSerialization.jsonObject(with: JSONEncoder().encode(frame))])
        return requestID
    }
    static func responseIDs(_ id: String) -> [String] {
        lock.lock(); defer { lock.unlock() }; return sessions[id]?.responses ?? []
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock(); defer { Self.lock.unlock() }
        do {
            let url = try #require(request.url)
            let id = url.pathComponents[3]
            let session = try #require(Self.sessions[id])
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer " + (session.active ? String(repeating: "A", count: 43) : session.pairing.token))
            var result: [String: Any] = ["id": id, "name": "App " + String(id.prefix(1)), "origin": "https://app-\(id.prefix(1)).example", "active": session.active, "expiresAt": Date.now.timeIntervalSince1970 * 1000 + 3600000]
            if url.path.hasSuffix("/activate") {
                Self.sessions[id]?.active = true
                result["active"] = true; result["walletToken"] = String(repeating: "A", count: 43)
            } else if url.path.hasSuffix("/messages"), request.httpMethod == "POST" {
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
                let message = try ConnectCipher.open(frame, pairing: session.pairing, role: "wallet")
                if message["type"] as? String == "response" {
                    Self.sessions[id]?.responses.append(try #require(message["id"] as? String))
                    #expect((message["error"] as? [String: Any])?["code"] as? Int == 4001)
                }
                result = ["ok": true]
            } else if url.path.hasSuffix("/messages") {
                let cursor = Int(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value ?? "0") ?? 0
                result = ["messages": session.messages.filter { ($0["sequence"] as? Int ?? 0) > cursor }, "expiresAt": Date.now.timeIntervalSince1970 * 1000 + 3600000]
            }
            let data = try JSONSerialization.data(withJSONObject: result)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

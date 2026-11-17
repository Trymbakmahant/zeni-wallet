import Foundation
import CryptoKit

struct ConnectPairing {
    let relay: URL
    let session: String
    let token: String
    let key: SymmetricKey

    init(uri: String) throws {
        guard uri.count <= 2048, let url = URLComponents(string: uri), url.scheme == "zeni", url.host == "connect",
              url.query == nil, let fragment = url.fragment,
              let query = URLComponents(string: "https://pairing.invalid/?" + fragment)?.queryItems,
              Set(query.map(\.name)).count == query.count else { throw ConnectError.invalid("Invalid Zeni connection QR.") }
        let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
        guard values["v"] == "1", let address = values["relay"], let relay = URLComponents(string: address),
              let relayURL = relay.url, relay.host != nil, relay.user == nil, relay.password == nil,
              relay.query == nil, relay.fragment == nil, relay.path.isEmpty || relay.path == "/",
              let session = values["session"], session.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
              let token = values["token"], token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
              let rawKey = values["key"], let key = Data(connectBase64: rawKey), key.count == 32 else {
            throw ConnectError.invalid("Invalid Zeni pairing credentials.")
        }
        var secure = relay.scheme == "https"
        #if DEBUG
        secure = secure || (relay.scheme == "http" && ["localhost", "127.0.0.1", "[::1]"].contains(relay.host ?? ""))
        #endif
        guard secure else { throw ConnectError.invalid("The relay must use HTTPS.") }
        self.relay = relayURL
        self.session = session
        self.token = token
        self.key = SymmetricKey(data: key)
    }
}

enum ConnectError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { switch self { case .invalid(let message): return message } }
}

struct ConnectFrame: Codable {
    let id: String
    let iv: String
    let ciphertext: String
}
struct ConnectSessionInfo: Decodable {
    let id: String
    let origin: String
    let name: String
    let expiresAt: Double
    let active: Bool
    let walletToken: String?
}
struct ConnectPoll: Decodable {
    struct Item: Decodable { let sequence: Int; let frame: ConnectFrame }
    let messages: [Item]
    let expiresAt: Double
}

extension Data {
    init?(connectBase64 value: String) {
        guard value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { return nil }
        let base = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        self.init(base64Encoded: base + String(repeating: "=", count: (4 - base.count % 4) % 4))
    }
    var connectBase64: String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}

enum ConnectCipher {
    static func seal(_ message: [String: Any], pairing: ConnectPairing, role: String = "wallet") throws -> ConnectFrame {
        let data = try JSONSerialization.data(withJSONObject: message)
        guard data.count <= 20000 else { throw ConnectError.invalid("Request is too large.") }
        let id = UUID().uuidString.lowercased()
        let aad = Data("zeni-connect:v1:\(pairing.session):\(role):\(id)".utf8)
        let box = try AES.GCM.seal(data, using: pairing.key, authenticating: aad)
        return ConnectFrame(id: id, iv: box.nonce.withUnsafeBytes { Data($0).connectBase64 }, ciphertext: (box.ciphertext + box.tag).connectBase64)
    }
    static func open(_ frame: ConnectFrame, pairing: ConnectPairing, role: String = "dapp") throws -> [String: Any] {
        guard frame.ciphertext.count <= 32768, UUID(uuidString: frame.id) != nil,
              let iv = Data(connectBase64: frame.iv), iv.count == 12,
              let encrypted = Data(connectBase64: frame.ciphertext), encrypted.count >= 16 else { throw ConnectError.invalid("Invalid encrypted message.") }
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: encrypted.dropLast(16), tag: encrypted.suffix(16))
        let aad = Data("zeni-connect:v1:\(pairing.session):\(role):\(frame.id)".utf8)
        let data = try AES.GCM.open(box, using: pairing.key, authenticating: aad)
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ConnectError.invalid("Invalid connection message.") }
        return value
    }
}

@MainActor
final class ConnectMailbox {
    let pairing: ConnectPairing
    private var authorizationToken: String
    private let delegate = ConnectNoRedirect()
    private let session: URLSession
    init(pairing: ConnectPairing, configuration: URLSessionConfiguration = .ephemeral) {
        self.pairing = pairing
        authorizationToken = pairing.token
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
        configuration.httpShouldSetCookies = false
        session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
    }
    func request(_ path: String = "", method: String = "GET", body: Data? = nil) async throws -> Data {
        let base = pairing.relay.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: base + "/v1/sessions/" + pairing.session + path) else { throw ConnectError.invalid("Invalid relay URL.") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer " + authorizationToken, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode), data.count <= 1_100_000 else {
            throw ConnectError.invalid("Relay session unavailable. Reconnect from the website.")
        }
        return data
    }
    func info(activate: Bool = false) async throws -> ConnectSessionInfo {
        let info = try JSONDecoder().decode(ConnectSessionInfo.self, from: await request(activate ? "/activate" : "", method: activate ? "POST" : "GET"))
        if activate {
            guard let token = info.walletToken, token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else {
                throw ConnectError.invalid("Invalid wallet session credential.")
            }
            authorizationToken = token
        }
        return info
    }
    func poll(after: Int) async throws -> ConnectPoll {
        try JSONDecoder().decode(ConnectPoll.self, from: await request("/messages?after=\(after)"))
    }
    func send(_ message: [String: Any]) async throws {
        let data = try JSONEncoder().encode(ConnectCipher.seal(message, pairing: pairing))
        // Reuse the same ID/ciphertext on retry; the relay deduplicates it.
        do { _ = try await request("/messages", method: "POST", body: data) }
        catch let error as URLError where error.code == .timedOut || error.code == .networkConnectionLost {
            _ = try await request("/messages", method: "POST", body: data)
        }
    }
    func cancel() { session.invalidateAndCancel() }
}
private final class ConnectNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

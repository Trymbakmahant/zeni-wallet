import Foundation
import CryptoKit
@testable import Zeni

/// Deterministic chain responses. This URLProtocol never forwards a request to the network.
final class MockChain: @unchecked Sendable {
    private let lock = NSLock()
    private var history: [WalletActivityItem] = []
    private var registered = false
    private var sequence = 0
    private var pendingIsRegistration = false
    private var account: PublicAccountInfo?
    private var broadcasts = 0
    private var hashWasSaved = true
    var loseBroadcastResponse = false
    var quoteOutput = "81062"

    func configure(account: PublicAccountInfo) { lock.withLock { self.account = account } }
    func persist(_ items: [WalletActivityItem]) { lock.withLock { history = items } }
    var broadcastCount: Int { lock.withLock { broadcasts } }
    var savedBeforeBroadcast: Bool { lock.withLock { hashWasSaved } }
    var records: [WalletActivityItem] { lock.withLock { history } }

    func response(to request: URLRequest) throws -> Data {
        try lock.withLock {
            guard let url = request.url else { throw URLError(.badURL) }
            let path = url.path
            let body: Data
            if let data = request.httpBody { body = data }
            else if let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var result = Data()
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }
                    result.append(buffer, count: count)
                }
                body = result
            } else { body = Data() }
            func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
            if url.host == "evm-testnet.qore.host" {
                let rpc = try JSONSerialization.jsonObject(with: body) as? [String: Any] ?? [:]
                let method = rpc["method"] as? String ?? ""
                let result: Any
                switch method {
                case "eth_chainId": result = "0x2648"
                case "eth_gasPrice": result = "0x1a3185c500"
                case "eth_getBalance": result = "0x8ac7230489e80000"
                case "eth_getCode": result = "0x"
                case "eth_getTransactionCount": result = "0x" + String(sequence, radix: 16)
                case "eth_blockNumber": result = "0x100"
                case "eth_getTransactionReceipt": result = NSNull()
                case "eth_sendRawTransaction":
                    let pending = history.first { !$0.nativeChain && $0.status == "PENDING" }
                    hashWasSaved = hashWasSaved && pending != nil
                    broadcasts += 1
                    result = pending?.hash ?? ""
                default: throw NSError(domain: "MockChain", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unexpected RPC method: " + method])
                }
                return try json(["jsonrpc": "2.0", "id": rpc["id"] ?? 1, "result": result])
            }
            if path.hasSuffix("/node_info") {
                return try json(["default_node_info": ["network": "qorechain-diana"]])
            }
            if path.contains("/pqc/v1/account/") {
                if registered, let hex = account?.pqcPublicKeyHex {
                    let characters = Array(hex.dropFirst(2))
                    let bytes = stride(from: 0, to: characters.count, by: 2).compactMap {
                        UInt8(String(characters[$0...$0 + 1]), radix: 16)
                    }
                    return try json(["found": true, "account": ["public_key": Data(bytes).base64EncodedString(), "possession_proven": true]])
                }
                return try json(["found": false])
            }
            if path.contains("/spendable_balances/") {
                return try json(["balances": [
                    ["denom": "uqor", "amount": "10000000"],
                    ["denom": "erc20:0x97143B771D34ddb9130b807b135Ae675A5a963CA", "amount": "1000000000"],
                    ["denom": "erc20:0x02292293c13880a26242690eb70a0e42B8E91c28", "amount": "500000000000000000"],
                    ["denom": "erc20:0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A", "amount": "2000000"]
                ], "pagination": [:]])
            }
            if path.hasSuffix("/amm/v1/pools") {
                return try json(["pools": [["id": "2", "status": "active", "token_a": "uqor",
                                           "token_b": "erc20:0x97143B771D34ddb9130b807b135Ae675A5a963CA",
                                           "reserve_a": "7000000000", "reserve_b": "600000000"]]])
            }
            if path.hasSuffix("/amm/v1/params") {
                return try json(["params": ["enabled": true, "max_swap_impact_bps": 500]])
            }
            if path.hasSuffix("/feemarket/v1/params") {
                return try json(["params": ["min_gas_price": "100000000000"]])
            }
            if path.hasSuffix("/protocol_features") {
                return try json(["features": [["name": "pqc-sign-bytes-v2", "enabled": true, "known": true]]])
            }
            if path.hasSuffix("/quote/exact_in") {
                return try json(["amount_out": quoteOutput, "fee": "3000", "impact_bps": 2])
            }
            if path.contains("/auth/v1beta1/accounts/") {
                return try json(["account": ["account_number": "1", "sequence": String(sequence)]])
            }
            if path.hasSuffix("/simulate") { return try json(["gas_info": ["gas_used": "100000"]]) }
            if path.hasSuffix("/txs"), request.httpMethod == "POST" {
                let payload = try JSONSerialization.jsonObject(with: body) as? [String: String] ?? [:]
                guard let bytes = Data(base64Encoded: payload["tx_bytes"] ?? "") else { throw URLError(.cannotDecodeContentData) }
                let hash = SHA256.hash(data: bytes).map { String(format: "%02X", $0) }.joined()
                hashWasSaved = hashWasSaved && history.contains { $0.hash == hash && $0.status == "PENDING" }
                broadcasts += 1
                pendingIsRegistration = !registered
                if loseBroadcastResponse { throw URLError(.networkConnectionLost) }
                return try json(["tx_response": ["code": 0, "txhash": hash]])
            }
            if path.contains("/txs/") {
                sequence += 1
                if pendingIsRegistration { registered = true; pendingIsRegistration = false }
                return try json(["tx_response": [
                    "code": 0, "height": "256", "txhash": url.lastPathComponent,
                    "events": [["type": "coin_received", "attributes": [
                        ["key": "receiver", "value": account?.cosmosAddress ?? ""],
                        ["key": "amount", "value": "81070erc20:0x97143B771D34ddb9130b807b135Ae675A5a963CA"]
                    ]]]
                ]])
            }
            throw NSError(domain: "MockChain", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unexpected REST path: " + path])
        }
    }
}

final class MockChainProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var chain: MockChain?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let chain = Self.chain, let url = request.url,
                  let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"]) else {
                throw URLError(.badServerResponse)
            }
            let data = try chain.response(to: request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

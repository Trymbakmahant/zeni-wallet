import Foundation

public struct RPCRequest<T: Encodable>: Encodable {
    public let jsonrpc = "2.0"
    public let id: Int
    public let method: String
    public let params: T

    public init(id: Int = 1, method: String, params: T) {
        self.id = id
        self.method = method
        self.params = params
    }
}

public struct RPCResponse<T: Decodable>: Decodable {
    public let jsonrpc: String
    public let id: Int
    public let result: T?
    public let error: RPCError?
}

public struct RPCError: Decodable {
    public let code: Int
    public let message: String
}

public final class QoreChainRPCClient {
    public let endpoint: URL
    private let session: URLSession

    public init(endpoint: URL = URL(string: "https://evm-testnet.qore.host")!) {
        self.endpoint = endpoint
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        self.session = URLSession(configuration: config)
    }

    public func call<Params: Encodable, Result: Decodable>(method: String, params: Params) async throws -> Result {
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let rpcReq = RPCRequest(method: method, params: params)
        req.httpBody = try JSONEncoder().encode(rpcReq)

        let (data, _) = try await session.data(for: req)
        let decoded = try JSONDecoder().decode(RPCResponse<Result>.self, from: data)

        if let error = decoded.error {
            throw NSError(domain: "QoreChainRPC", code: error.code, userInfo: [NSLocalizedDescriptionKey: error.message])
        }

        guard let result = decoded.result else {
            throw NSError(domain: "QoreChainRPC", code: -1, userInfo: [NSLocalizedDescriptionKey: "Empty RPC result"])
        }

        return result
    }

    public func getBalance(address: String) async throws -> String {
        return try await call(method: "eth_getBalance", params: [address, "latest"])
    }
}

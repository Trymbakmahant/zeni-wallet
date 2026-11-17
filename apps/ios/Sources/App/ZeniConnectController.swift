import Foundation
import Observation

struct DappReview: Decodable {
    let kind: String
    let message: String?
    let quote: TransferQuote?
    let reviewId: String
}
struct ConnectPending: Identifiable {
    let id: String
    let method: String
    let params: [Any]
    let expiresAt: Double
}

@MainActor
@Observable
final class ZeniConnectController {
    var isPresented = false
    private(set) var proposal: ConnectSessionInfo?
    private(set) var connected: ConnectSessionInfo?
    private(set) var pending: ConnectPending?
    private(set) var review: DappReview?
    private(set) var busy = false
    var error: String?
    @ObservationIgnored private weak var state: AppState?
    @ObservationIgnored private var mailbox: ConnectMailbox?
    @ObservationIgnored private var polling: Task<Void, Never>?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var handled = Set<String>()
    @ObservationIgnored private var account: String?

    init(state: AppState) { self.state = state }

    func pair(_ uri: String) async {
        isPresented = true
        guard !busy, mailbox == nil else { error = "Disconnect the current site before scanning another QR."; return }
        busy = true; error = nil
        defer { busy = false }
        let version = generation
        do {
            let pairing = try ConnectPairing(uri: uri)
            let client = ConnectMailbox(pairing: pairing)
            let info = try await client.info()
            guard version == generation else { client.cancel(); return }
            guard !info.active, info.expiresAt > Date.now.timeIntervalSince1970 * 1000 else { throw ConnectError.invalid("QR code expired or already used. Generate a new one.") }
            mailbox = client; proposal = info
        } catch { self.error = error.localizedDescription }
    }
    func approveConnection() async {
        guard !busy, let state, let active = state.activeAccount, state.isUnlocked, let client = mailbox, proposal != nil else {
            error = "Unlock your wallet before connecting."; return
        }
        busy = true; error = nil
        let version = generation
        defer { busy = false }
        do {
            let info = try await client.info(activate: true)
            guard version == generation, state.isUnlocked else { throw ConnectError.invalid("Wallet locked. Reconnect and approve again.") }
            try await client.send(["type": "approved", "account": active.evmAddress, "chainId": "0x2648", "expiresAt": info.expiresAt])
            guard version == generation else { return }
            account = active.evmAddress; connected = info; proposal = nil
            startPolling(client, version: version)
        } catch { self.error = error.localizedDescription }
    }
    private func startPolling(_ client: ConnectMailbox, version: Int) {
        polling = Task { @MainActor [weak self] in
            var cursor = 0
            do {
                while !Task.isCancelled {
                    guard let self, self.generation == version else { return }
                    let result = try await client.poll(after: cursor)
                    guard self.generation == version else { return }
                    guard result.messages.count <= 32, result.expiresAt > Date.now.timeIntervalSince1970 * 1000 else { throw ConnectError.invalid("Connection expired.") }
                    for item in result.messages {
                        guard item.sequence > cursor else { throw ConnectError.invalid("Invalid relay sequence.") }
                        let message = try ConnectCipher.open(item.frame, pairing: client.pairing)
                        try await self.receive(message, client: client)
                        cursor = item.sequence
                    }
                    if let pending = self.pending, pending.expiresAt <= Date.now.timeIntervalSince1970 * 1000, !self.busy { await self.rejectRequest(reason: "Request expired") }
                    try await Task.sleep(for: .seconds(1))
                }
            } catch {
                guard let self, !Task.isCancelled, self.generation == version else { return }
                self.clear(); self.error = error.localizedDescription
            }
        }
    }
    private func receive(_ message: [String: Any], client: ConnectMailbox) async throws {
        if message["type"] as? String == "disconnect" { clear(); return }
        guard message["type"] as? String == "request", let request = message["request"] as? [String: Any],
              let id = request["id"] as? String, UUID(uuidString: id) != nil, let method = request["method"] as? String,
              let params = request["params"] as? [Any], let expiry = message["expiresAt"] as? Double else { throw ConnectError.invalid("Invalid signing request.") }
        guard !handled.contains(id) else { return }
        guard handled.count < 1000 else { throw ConnectError.invalid("Session limit reached. Reconnect.") }
        handled.insert(id)
        let now = Date.now.timeIntervalSince1970 * 1000
        let failure: (Int, String)? = !["personal_sign", "eth_sendTransaction"].contains(method) ? (4200, "Unsupported signing method")
            : expiry <= now || expiry > now + 305000 ? (4001, "Request expired")
            : pending != nil || busy ? (-32002, "Another wallet request is pending") : nil
        if let failure { try await client.send(["type": "response", "id": id, "error": ["code": failure.0, "message": failure.1]]); return }
        pending = ConnectPending(id: id, method: method, params: params, expiresAt: expiry)
        review = nil; error = nil; isPresented = true
    }
    func prepareRequest() async {
        guard !busy, let pending, let state else { return }
        busy = true; error = nil
        let version = generation
        defer { busy = false }
        do {
            try checkRequest(pending)
            let prepared = try await state.prepareDapp(method: pending.method, params: pending.params)
            try checkRequest(pending)
            guard version == generation else { return }
            review = prepared
        } catch { self.error = error.localizedDescription }
    }
    func approveRequest() async {
        guard !busy, let pending, let review, let state, let client = mailbox else { return }
        busy = true; error = nil
        let version = generation
        defer { busy = false }
        do {
            try checkRequest(pending)
            let result = try await state.executeDapp(review: review)
            guard version == generation else { return }
            // A submitted transaction's hash must still be returned if the request expired during submission.
            try await client.send(["type": "response", "id": pending.id, "result": result])
            self.pending = nil; self.review = nil
        } catch {
            guard version == generation else { return }
            self.error = error.localizedDescription
            try? await client.send(["type": "response", "id": pending.id, "error": ["code": -32603, "message": error.localizedDescription]])
            self.pending = nil; self.review = nil
        }
    }
    private func checkRequest(_ request: ConnectPending) throws {
        guard let state, state.isUnlocked, state.activeAccount?.evmAddress == account,
              request.expiresAt > Date.now.timeIntervalSince1970 * 1000, self.pending?.id == request.id else {
            throw ConnectError.invalid("Wallet locked, account changed, or request expired. Review again.")
        }
    }
    func rejectRequest(reason: String = "User rejected request") async {
        guard !busy, let request = pending, let client = mailbox else { return }
        pending = nil; review = nil
        do { try await client.send(["type": "response", "id": request.id, "error": ["code": 4001, "message": reason]]) }
        catch { self.error = error.localizedDescription }
    }
    func rejectConnection() async {
        guard !busy, let client = mailbox else { return }
        try? await client.send(["type": "rejected", "reason": "User rejected connection"])
        clear()
    }
    func disconnect() async {
        guard !busy else { return }
        let client = mailbox
        // Delete with the live client before disposing of its credentials.
        if let client { _ = try? await client.request(method: "DELETE") }
        clear()
    }
    func walletLocked() { review = nil }
    private func clear() {
        generation += 1; polling?.cancel(); polling = nil; mailbox?.cancel(); mailbox = nil
        proposal = nil; connected = nil; pending = nil; review = nil; account = nil; handled.removeAll()
    }
}

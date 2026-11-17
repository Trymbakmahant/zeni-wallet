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

struct ConnectRequestRecord: Identifiable {
    let id: String
    let method: String
    let date: Date
    var status: String
    var transactionHash: String?
}

/// Each app has its own credentials, replay set, request, and polling lifecycle.
@MainActor
@Observable
final class ZeniConnectController {
    var isPresented = false
    var selectedID: UUID?
    var error: String?
    var presentationBlocked = false
    private(set) var sessions: [ZeniConnectSession] = []
    private(set) var pairing = false
    @ObservationIgnored private weak var state: AppState?
    @ObservationIgnored private let makeMailbox: @MainActor (ConnectPairing) -> ConnectMailbox

    init(state: AppState, makeMailbox: @escaping @MainActor (ConnectPairing) -> ConnectMailbox = { ConnectMailbox(pairing: $0) }) {
        self.state = state; self.makeMailbox = makeMailbox
    }
    var selected: ZeniConnectSession? { sessions.first { $0.id == selectedID } }
    var connectedApps: [ZeniConnectSession] { sessions.filter { $0.connected != nil } }
    var pendingCount: Int { sessions.filter { $0.pending != nil }.count }
    var busy: Bool { pairing || sessions.contains { $0.busy } || state?.isTransacting == true }

    func pair(_ uri: String) async {
        guard !busy, let state else { return }
        if let pairing = try? ConnectPairing(uri: uri), sessions.contains(where: { ($0.connected ?? $0.proposal)?.id == pairing.session }) {
            error = "This app session is already connected or waiting for approval."; return
        }
        guard sessions.count < 8 else { error = "Up to 8 apps can connect at once. Disconnect an app to add another."; return }
        pairing = true; error = nil; isPresented = true
        defer { pairing = false }
        let session = ZeniConnectSession(state: state, makeMailbox: makeMailbox)
        session.onPresent = { [weak self, weak session] in
            guard let self, let session else { return }
            self.present(session)
        }
        session.onEnd = { [weak self, weak session] reason in
            guard let self, let session else { return }
            self.sessions.removeAll { $0.id == session.id }
            if self.selectedID == session.id { self.selectedID = nil }
            self.error = reason
        }
        sessions.append(session)
        await session.pair(uri)
        if session.proposal == nil {
            sessions.removeAll { $0.id == session.id }
            error = session.error
        }
    }

    func openApps() { selectedID = nil; error = nil; isPresented = true }
    func present(_ session: ZeniConnectSession) {
        // Never replace a review or biometric prompt with a different app's request.
        guard !presentationBlocked, state?.isTransacting != true,
              !(isPresented && selectedID != session.id && (selected?.busy == true || selected?.pending != nil)) else { return }
        selectedID = session.id; isPresented = true
    }
    func presentNextPending() {
        guard let session = sessions.first(where: { $0.pending != nil }) else { return }
        present(session)
    }
    func walletLocked() { sessions.forEach { $0.walletLocked() } }
}

@MainActor
@Observable
final class ZeniConnectSession: Identifiable {
    let id = UUID()
    var onPresent: (() -> Void)?
    var onEnd: ((String?) -> Void)?
    private(set) var history: [ConnectRequestRecord] = []
    private(set) var proposal: ConnectSessionInfo?
    private(set) var connected: ConnectSessionInfo?
    private(set) var pending: ConnectPending?
    private(set) var review: DappReview?
    private(set) var reviewExpiresAt: Date?
    private(set) var busy = false
    var error: String?
    @ObservationIgnored private weak var state: AppState?
    @ObservationIgnored private var mailbox: ConnectMailbox?
    @ObservationIgnored private var polling: Task<Void, Never>?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var handled = Set<String>()
    @ObservationIgnored private var account: String?

    @ObservationIgnored private let makeMailbox: @MainActor (ConnectPairing) -> ConnectMailbox
    init(state: AppState, makeMailbox: @escaping @MainActor (ConnectPairing) -> ConnectMailbox) {
        self.state = state
        self.makeMailbox = makeMailbox
    }

    func pair(_ uri: String) async {
        guard !busy, mailbox == nil else { error = "Disconnect the current site before scanning another QR."; return }
        busy = true; error = nil
        defer { busy = false }
        let version = generation
        do {
            let pairing = try ConnectPairing(uri: uri)
            let client = makeMailbox(pairing)
            let info = try await client.info()
            guard version == generation else { client.cancel(); return }
            guard !info.active, info.expiresAt > Date.now.timeIntervalSince1970 * 1000 else { throw ConnectError.invalid("QR code expired or already used. Generate a new one.") }
            mailbox = client; proposal = info
            onPresent?()
        } catch { self.error = error.localizedDescription }
    }
    func approveConnection() async {
        guard !busy, let state, let active = state.activeAccount, state.hasWallet, let client = mailbox, let proposal else {
            error = "Import a wallet before connecting."; return
        }
        busy = true; error = nil
        let version = generation
        defer { busy = false }
        do {
            let info = try await client.info(activate: true)
            guard info.id == proposal.id, info.origin == proposal.origin, info.name == proposal.name else {
                throw ConnectError.invalid("The app identity changed. Disconnect and scan a fresh QR code.")
            }
            guard version == generation, state.hasWallet else { throw ConnectError.invalid("Wallet changed. Reconnect and approve again.") }
            try await client.send(["type": "approved", "account": active.evmAddress, "chainId": "0x2648", "expiresAt": info.expiresAt])
            guard version == generation else { return }
            account = active.evmAddress; connected = info; self.proposal = nil
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
                self.clear(reason: error.localizedDescription)
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
        let failure: (Int, String)? = !["personal_sign", "zeni_sendQor"].contains(method) ? (4200, "Unsupported signing method")
            : expiry <= now || expiry > now + 305000 ? (4001, "Request expired")
            : pending != nil || busy ? (-32002, "Another wallet request is pending") : nil
        if let failure { try await client.send(["type": "response", "id": id, "error": ["code": failure.0, "message": failure.1]]); return }
        pending = ConnectPending(id: id, method: method, params: params, expiresAt: expiry)
        review = nil; reviewExpiresAt = nil; error = nil
        history.insert(ConnectRequestRecord(id: id, method: method, date: .now, status: "Awaiting review"), at: 0)
        history = Array(history.prefix(30))
        onPresent?()
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
            reviewExpiresAt = Date(timeIntervalSince1970: min(pending.expiresAt, prepared.quote?.expiresAt ?? (Date.now.timeIntervalSince1970 * 1000 + 120000)) / 1000)
        } catch { self.error = error.localizedDescription }
    }
    func approveRequest() async {
        guard !busy, let pending, let review, let state, let client = mailbox else { return }
        busy = true; error = nil
        let version = generation
        defer { busy = false }
        do {
            try checkRequest(pending)
            let result = try await state.executeDapp(review: review) {
                try self.checkRequest(pending)
                guard version == self.generation else { throw CancellationError() }
            }
            guard version == generation else { return }
            updateHistory(pending.id, status: pending.method == "zeni_sendQor" ? "Confirmed" : "Signed", result: pending.method == "zeni_sendQor" ? result : nil)
            // Preserve the submission hash even if delivering the result to the website fails.
            try await client.send(["type": "response", "id": pending.id, "result": result])
            self.pending = nil; self.review = nil
        } catch {
            guard version == generation else { return }
            self.error = error.localizedDescription
            if history.first(where: { $0.id == pending.id })?.transactionHash == nil {
                updateHistory(pending.id, status: "Failed · check Activity before retrying")
            }
            try? await client.send(["type": "response", "id": pending.id, "error": ["code": -32603, "message": error.localizedDescription]])
            self.pending = nil; self.review = nil
        }
    }
    private func checkRequest(_ request: ConnectPending) throws {
        guard let state, state.hasWallet, state.activeAccount?.evmAddress == account,
              request.expiresAt > Date.now.timeIntervalSince1970 * 1000, self.pending?.id == request.id else {
            throw ConnectError.invalid("Account changed or request expired. Review again.")
        }
    }
    func rejectRequest(reason: String = "User rejected request") async {
        guard !busy, let request = pending, let client = mailbox else { return }
        pending = nil; review = nil
        updateHistory(request.id, status: reason == "Request expired" ? "Expired" : "Rejected")
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
    func walletLocked() { review = nil; reviewExpiresAt = nil }
    private func updateHistory(_ id: String, status: String, result: String? = nil) {
        guard let index = history.firstIndex(where: { $0.id == id }) else { return }
        history[index].status = status
        history[index].transactionHash = result
    }
    private func clear(reason: String? = nil) {
        generation += 1; polling?.cancel(); polling = nil; mailbox?.cancel(); mailbox = nil
        proposal = nil; connected = nil; pending = nil; review = nil; account = nil; handled.removeAll()
        onEnd?(reason)
    }
}

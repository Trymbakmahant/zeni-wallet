import SwiftUI
import VisionKit

struct ZeniConnectView: View {
    let state: AppState
    @Bindable var controller: ZeniConnectController
    @State private var uri = ""
    @State private var scanning = false
    @State private var addingApp = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let session = controller.selected {
                    ConnectAppDetail(state: state, session: session)
                        .id(session.id)
                } else {
                    appsList
                }
            }
            .background(Color.zeniBackground).foregroundStyle(.white)
            .navigationTitle(controller.selected == nil ? "Connected apps" : "Zeni Connect")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if controller.selected != nil {
                        Button { controller.selectedID = nil } label: { Label("Apps", systemImage: "chevron.left") }
                            .disabled(controller.busy)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.disabled(controller.busy || state.isAuthenticating)
                }
            }
            .sheet(isPresented: $scanning) {
                NavigationStack {
                    ConnectQRScanner { value in
                        scanning = false
                        Task { await controller.pair(value) }
                    } onError: { message in controller.error = message; scanning = false }
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { scanning = false } } }
                }
            }
        }
        .onChange(of: controller.selectedID) { scanning = false }
        .interactiveDismissDisabled(controller.busy || state.isAuthenticating)
        .tint(.zeniAccent).preferredColorScheme(.dark)
        .presentationDragIndicator(.visible)
    }

    private var appsList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Your apps. Your approval.").font(.title2.bold())
                Text("Tap an app to review its requests or disconnect. Only you can approve a signature or transfer.")
                    .font(.subheadline).foregroundStyle(Color.zeniMuted)
                if let error = controller.error { Text(error).font(.callout).foregroundStyle(.red) }
                if controller.sessions.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "app.connected.to.app.below.fill").font(.system(size: 34)).foregroundStyle(Color.zeniAccent)
                        Text("No apps connected yet").font(.headline)
                        Text("Scan a Zeni Connect QR code from a website to get started.").font(.subheadline).foregroundStyle(Color.zeniMuted).multilineTextAlignment(.center)
                    }.frame(maxWidth: .infinity).padding(28).zeniSurface()
                }
                ForEach(controller.sessions) { session in
                    if let site = session.connected ?? session.proposal {
                        Button { controller.selectedID = session.id } label: {
                            VStack(alignment: .leading, spacing: 14) {
                                ConnectAppIdentity(site: site, compact: true)
                                HStack {
                                    Label(session.pending == nil ? (session.connected == nil ? "Approve connection" : "Connected") : "Request awaiting review",
                                          systemImage: session.pending == nil ? "link" : "bell.badge.fill")
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                }.font(.caption.weight(.medium)).foregroundStyle(session.pending == nil ? Color.zeniGreen : Color.zeniAccent)
                            }.padding(18).zeniSurface()
                        }.buttonStyle(.plain).disabled(controller.busy)
                    }
                }
                Button { addingApp.toggle() } label: {
                    Label("Connect another app", systemImage: "plus").frame(maxWidth: .infinity)
                }.buttonStyle(ZeniPrimaryButtonStyle()).disabled(controller.busy)
                if addingApp {
                    VStack(alignment: .leading, spacing: 14) {
                        if DataScannerViewController.isSupported {
                            Button { scanning = true } label: { Label("Scan QR code", systemImage: "qrcode.viewfinder").frame(maxWidth: .infinity, minHeight: 48) }
                                .zeniSurface().disabled(controller.busy)
                        }
                        TextField("Paste a zeni://connect link", text: $uri, axis: .vertical)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive()
                            .padding(16).zeniSurface().disabled(controller.busy)
                        Button(controller.pairing ? "Connecting…" : "Open connection") {
                            let value = uri; uri = ""
                            Task { await controller.pair(value) }
                        }.disabled(uri.isEmpty || controller.busy)
                    }
                }
                Text("Diana Testnet · Connections last up to one hour and end when the wallet closes. Keep Zeni open to receive requests.")
                    .font(.caption).foregroundStyle(Color.zeniMuted)
            }.padding(22)
        }
    }
}

struct ConnectAppIdentity: View {
    let site: ConnectSessionInfo
    var compact = false

    // Fetch only the public favicon from the app's own origin; pairing secrets never leave the relay channel.
    private var favicon: URL? {
        guard let origin = URLComponents(string: site.origin), origin.scheme == "https",
              origin.host != nil, origin.user == nil, origin.password == nil else { return nil }
        return URL(string: site.origin + "/favicon.ico")
    }
    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            AsyncImage(url: favicon) { phase in
                if let image = phase.image { image.resizable().scaledToFit().padding(8) }
                else { Text(String(site.name.prefix(1)).uppercased()).font(.title2.bold()).foregroundStyle(Color.zeniAccent) }
            }
            .frame(width: compact ? 48 : 64, height: compact ? 48 : 64)
            .background(Color.zeniCard, in: RoundedRectangle(cornerRadius: 16))
            .clipShape(RoundedRectangle(cornerRadius: 16)).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(site.name).font(compact ? .headline : .title2.bold()).lineLimit(2)
                Text(site.origin).font(.caption).foregroundStyle(Color.zeniMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ConnectAppDetail: View {
    let state: AppState
    @Bindable var session: ZeniConnectSession

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let site = session.proposal ?? session.connected {
                    ConnectAppIdentity(site: site)
                    if session.proposal != nil { connectionReview }
                    else if let request = session.pending { requestReview(request) }
                    else { appRequests(site) }
                }
                if let error = session.error {
                    Label(error, systemImage: "exclamationmark.triangle").font(.callout).foregroundStyle(.red)
                }
            }.padding(22)
        }
        .safeAreaInset(edge: .bottom) { actions }
        .task(id: session.pending?.id) {
            if session.pending != nil, !state.isTransacting { await session.prepareRequest() }
        }
    }

    private var connectionReview: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Connect to this app?").font(.title2.bold())
            Text("Check the website address above matches the page you opened. An app name or logo does not verify its identity.")
                .font(.subheadline).foregroundStyle(Color.zeniMuted)
            VStack(alignment: .leading, spacing: 18) {
                Label("See your public account address", systemImage: "person.crop.circle")
                Label("Ask you to sign messages or send QOR", systemImage: "signature")
                Label("Every request needs your approval", systemImage: "hand.raised")
            }.font(.subheadline).padding(20).zeniSurface()
            detail("Network", "QoreChain Diana · 9800")
            if let account = state.activeAccount { detail("Account", account.evmAddress) }
            Text("Connecting does not let an app move your funds.").font(.caption).foregroundStyle(Color.zeniMuted)
        }
    }

    @ViewBuilder private func requestReview(_ request: ConnectPending) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Label(request.method == "personal_sign" ? "Signature request" : "Review transfer", systemImage: request.method == "personal_sign" ? "signature" : "arrow.up.right")
                .font(.title2.bold())
            if let review = session.review {
                if let message = review.message {
                    Text("Message from this app").font(.caption).foregroundStyle(Color.zeniMuted)
                    Text(message).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(18).zeniSurface()
                    Text("A signature can authorize a login or agreement. Read the complete message before approving.")
                        .font(.caption).foregroundStyle(Color.zeniMuted)
                }
                if let quote = review.quote {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("YOU SEND").font(.caption.weight(.semibold)).foregroundStyle(Color.zeniMuted)
                        Text(quote.amount + " QOR").font(.largeTitle.bold())
                        Text("QoreChain Diana Testnet").font(.caption).foregroundStyle(Color.zeniAccent)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(20).zeniSurface()
                    let entered = (request.params.first as? [String: Any])?["to"] as? String
                    detail("Recipient", entered?.trimmingCharacters(in: .whitespacesAndNewlines) ?? quote.to)
                    if entered?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().hasPrefix("qor1") == true {
                        detail("Same recipient · EVM address", quote.to)
                    }
                    detail("Maximum network & setup fees", quote.maxNetworkFee + " QOR")
                    DisclosureGroup("QoreChain authorization details") {
                        VStack(alignment: .leading, spacing: 12) {
                            detail("Authorization limit", quote.authorizationLimit)
                            Text("One transfer to this recipient for \(quote.windowBlocks) blocks. Setup fees may still be charged if the transfer fails.").font(.caption)
                            if quote.registrationRequired { Text("Includes registration of your post-quantum public key.").font(.caption) }
                        }.padding(.top, 12)
                    }.font(.subheadline).padding(16).zeniSurface()
                }
                if let account = state.activeAccount { detail("From your wallet", account.evmAddress) }
                Text("Face ID or Touch ID confirms your approval. No transaction is signed before you approve.")
                    .font(.caption).foregroundStyle(Color.zeniMuted)
            } else if session.busy {
                ProgressView("Preparing your review…").frame(maxWidth: .infinity).padding(24)
            } else {
                Text("The request could not be prepared. Check the error below, retry, or reject it.").foregroundStyle(Color.zeniMuted)
                Button("Retry review") { Task { await session.prepareRequest() } }
                    .disabled(session.busy || state.isTransacting)
            }
        }
    }

    private func appRequests(_ site: ConnectSessionInfo) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(Color.zeniGreen)
            Text("Requests from this app will appear here and open a review prompt while Zeni is active.")
                .font(.subheadline).foregroundStyle(Color.zeniMuted)
            Text("Requests this session").font(.headline)
            if session.history.isEmpty {
                Text("No requests yet.").foregroundStyle(Color.zeniMuted).padding(18).frame(maxWidth: .infinity).zeniSurface()
            }
            ForEach(session.history) { item in
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Label(item.method == "personal_sign" ? "Message signature" : "QOR transfer", systemImage: item.method == "personal_sign" ? "signature" : "arrow.up.right")
                        Spacer()
                        Text(item.date, style: .time).font(.caption).foregroundStyle(Color.zeniMuted)
                    }.font(.subheadline.weight(.medium))
                    Text(item.status).font(.caption).foregroundStyle(Color.zeniMuted)
                    if let hash = item.transactionHash {
                        Text(hash).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                        Text("Submitted is not confirmed. Check Activity for the receipt.").font(.caption2).foregroundStyle(Color.zeniMuted)
                    }
                }.padding(16).zeniSurface()
            }
            detail("Connection expires", Date(timeIntervalSince1970: site.expiresAt / 1000).formatted(date: .omitted, time: .shortened))
            Button("Disconnect app", role: .destructive) { Task { await session.disconnect() } }
                .frame(maxWidth: .infinity, minHeight: 48).zeniSurface()
                .disabled(session.busy || state.isTransacting)
        }
    }

    @ViewBuilder private var actions: some View {
        if session.proposal != nil || session.pending != nil {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let expired = session.reviewExpiresAt.map { $0 <= context.date } ?? false
                HStack(spacing: 12) {
                    Button("Reject", role: .destructive) {
                        Task {
                            if session.proposal != nil { await session.rejectConnection() }
                            else { await session.rejectRequest() }
                        }
                    }.frame(minWidth: 90, minHeight: 50).zeniSurface(radius: 14)
                    Button {
                        Task {
                            if session.proposal != nil { await session.approveConnection() }
                            else if expired { await session.prepareRequest() }
                            else { await session.approveRequest() }
                        }
                    } label: {
                        Text(session.busy ? "Please wait…" : session.proposal != nil ? "Connect app" : expired ? "Refresh review" : "Approve")
                    }.buttonStyle(ZeniPrimaryButtonStyle())
                        .disabled(!state.hasWallet || (session.proposal == nil && session.review == nil))
                }
                .disabled(session.busy || state.isTransacting || state.isAuthenticating)
                .padding(18).background(Color.zeniBackground)
            }
        }
    }
    private func detail(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(Color.zeniMuted)
            Text(value).font(.subheadline).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        }
    }
}
private struct ConnectQRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void
    let onError: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced,
                                                recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false,
                                                isPinchToZoomEnabled: true, isGuidanceEnabled: true, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        do { try scanner.startScanning() }
        catch { DispatchQueue.main.async { onError("Camera unavailable. Allow camera access in Settings or paste the connection link.") } }
        return scanner
    }
    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ uiViewController: DataScannerViewController, coordinator: Coordinator) { uiViewController.stopScanning() }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var handled = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !handled else { return }
            for item in addedItems {
                if case .barcode(let code) = item, let value = code.payloadStringValue, value.hasPrefix("zeni://connect") {
                    handled = true; dataScanner.stopScanning(); onCode(value); return
                }
            }
        }
    }
}

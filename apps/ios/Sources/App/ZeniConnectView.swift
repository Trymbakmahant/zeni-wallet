import SwiftUI
import VisionKit

struct ZeniConnectView: View {
    let state: AppState
    @Bindable var controller: ZeniConnectController
    @State private var uri = ""
    @State private var scanning = false
    @State private var unlocking = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Connect a website").font(.title2.bold())
                    Text("Use Zeni to approve requests from web apps. Your keys stay in your wallet.").foregroundStyle(Color.zeniMuted)
                    if let error = controller.error { Text(error).foregroundStyle(.red).textSelection(.enabled) }
                    if !state.isUnlocked {
                        Text(state.hasWallet ? "Unlock to approve connections and signing requests." : "Import a wallet from the home screen first.")
                        if state.hasWallet {
                            Button(unlocking ? "Unlocking…" : "Unlock wallet") {
                                unlocking = true
                                Task {
                                    do { try await state.unlock() } catch { controller.error = error.localizedDescription }
                                    unlocking = false
                                }
                            }.disabled(unlocking).buttonStyle(ZeniPrimaryButtonStyle())
                        }
                    }
                    if let site = controller.proposal {
                        siteHeader(site)
                        Text("This site will see your public account address and may request QOR transfers or message signatures. Each request needs your approval.")
                        Text("Check that this address matches the website you opened. A site name is not proof of identity.").font(.caption).foregroundStyle(Color.zeniMuted)
                        HStack {
                            Button("Reject") { Task { await controller.rejectConnection() } }
                            Spacer()
                            Button("Connect") { Task { await controller.approveConnection() } }
                                .disabled(!state.isUnlocked || controller.busy)
                        }
                    } else if let site = controller.connected {
                        siteHeader(site)
                        if let pending = controller.pending {
                            Text(pending.method == "personal_sign" ? "Sign message" : "Send QOR").font(.headline)
                            if let review = controller.review {
                                if let message = review.message {
                                    Text(message).font(.system(.body, design: .monospaced)).textSelection(.enabled)
                                        .frame(maxWidth: .infinity, alignment: .leading).padding().background(Color.zeniCard, in: RoundedRectangle(cornerRadius: 12))
                                    Text("Signing a message can authorize a login or agreement. Approve only if you understand every part.").font(.caption)
                                }
                                if let quote = review.quote {
                                    detail("Amount", quote.amount + " QOR")
                                    detail("Recipient", quote.to)
                                    detail("Maximum network/setup fees", quote.maxNetworkFee + " QOR")
                                    detail("Authorization limit", quote.authorizationLimit)
                                    Text("Allows one QOR transfer to this recipient for \(quote.windowBlocks) blocks. Setup fees may be charged even if the transfer fails.").font(.caption)
                                    if quote.registrationRequired { Text("Also registers your post-quantum public key.").font(.caption) }
                                }
                                Button(controller.busy ? "Processing…" : "Approve in wallet") { Task { await controller.approveRequest() } }
                                    .disabled(!state.isUnlocked || controller.busy).buttonStyle(ZeniPrimaryButtonStyle())
                            } else {
                                Text("Review the complete request before signing.")
                                Button("Review request") { Task { await controller.prepareRequest() } }
                                    .disabled(!state.isUnlocked || controller.busy).buttonStyle(ZeniPrimaryButtonStyle())
                            }
                            Button("Reject request", role: .destructive) { Task { await controller.rejectRequest() } }.disabled(controller.busy)
                        } else { Text("Connected. Keep Zeni open while approving requests from the website.").foregroundStyle(Color.zeniMuted) }
                        Button("Disconnect site", role: .destructive) { Task { await controller.disconnect() } }.disabled(controller.busy)
                    } else {
                        if DataScannerViewController.isSupported {
                            Button { scanning = true } label: { Label("Scan connection QR", systemImage: "qrcode.viewfinder") }
                                .buttonStyle(ZeniPrimaryButtonStyle()).disabled(controller.busy)
                        }
                        TextField("Or paste a zeni://connect link", text: $uri, axis: .vertical)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive()
                            .padding().background(Color.zeniCard, in: RoundedRectangle(cornerRadius: 12))
                        Button(controller.busy ? "Connecting…" : "Open connection") {
                            let value = uri; uri = ""
                            Task { await controller.pair(value) }
                        }.disabled(uri.isEmpty || controller.busy)
                    }
                    Text("QoreChain Diana Testnet · Zeni Connect v1").font(.caption).foregroundStyle(Color.zeniMuted)
                }.padding(24)
            }
            .background(Color.zeniBackground).foregroundStyle(.white)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(isPresented: $scanning) {
                NavigationStack {
                    ConnectQRScanner { value in
                        scanning = false
                        Task { await controller.pair(value) }
                    } onError: { message in controller.error = message; scanning = false }
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { scanning = false } } }
                }
            }
        }.tint(.zeniAccent).preferredColorScheme(.dark)
    }
    private func siteHeader(_ site: ConnectSessionInfo) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(site.origin).font(.headline).textSelection(.enabled)
            Text(site.name).foregroundStyle(Color.zeniMuted)
            Text("Expires " + Date(timeIntervalSince1970: site.expiresAt / 1000).formatted(date: .omitted, time: .shortened)).font(.caption)
        }.padding().frame(maxWidth: .infinity, alignment: .leading).background(Color.zeniCard, in: RoundedRectangle(cornerRadius: 12))
    }
    private func detail(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(label).font(.caption).foregroundStyle(Color.zeniMuted); Text(value).textSelection(.enabled) }
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

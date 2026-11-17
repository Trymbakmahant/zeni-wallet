import SwiftUI
import LocalAuthentication
import UIKit
import UniformTypeIdentifiers

struct WalletOnboardingView: View {
    let state: AppState
    @Environment(\.scenePhase) private var scenePhase
    @State private var step: Step = .welcome
    @State private var phrase = ""
    @State private var importedPhrase = ""
    @State private var revealed = false
    @State private var backedUp = false
    @State private var answers = ["", "", ""]
    @State private var working = false
    @State private var error: String?
    private let challenges = [2, 6, 10]

    private enum Step { case welcome, backup, verify, importPhrase, protect }

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 24) {
                        if step != .welcome {
                            HStack {
                                Button(action: goBack) {
                                    Image(systemName: "arrow.left").frame(width: 44, height: 44).zeniSurface(radius: 22)
                                }.accessibilityLabel("Back").disabled(working)
                                Spacer()
                                Text("WALLET SETUP").font(.system(.caption2, design: .monospaced)).foregroundStyle(Color.zeniMuted)
                            }
                        }
                        switch step {
                        case .welcome: welcome
                        case .backup: backup
                        case .verify: verification
                        case .importPhrase: importForm
                        case .protect: protection
                        }
                        if working { ProgressView("Preparing your wallet…").frame(maxWidth: .infinity) }
                        if let error { Text(error).font(.callout).foregroundStyle(.red).accessibilityLabel("Setup error: " + error) }
                    }
                    .padding(24)
                    .frame(maxWidth: 520)
                    .frame(maxWidth: .infinity)
                    if step == .welcome {
                        Spacer(minLength: 0)
                        OnboardingLandscape().frame(height: 210)
                    }
                }
                .frame(minHeight: geometry.size.height, alignment: .top)
            }
        }
        .ignoresSafeArea(.container, edges: step == .welcome ? .bottom : [])
        .background(Color.zeniBackground.ignoresSafeArea())
        .foregroundStyle(.white)
        .tint(.zeniAccent)
        .preferredColorScheme(.dark)
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: scenePhase) {
            if scenePhase != .active { revealed = false }
        }
        .onDisappear { clearSecrets() }
    }

    private var welcome: some View {
        VStack(spacing: 28) {
            VStack(spacing: 18) {
                ZeniBrandMark().padding(.top, 38)
                VStack(spacing: 0) {
                    Text("Zeni").font(.system(size: 48, weight: .black))
                    Text("Wallet").font(.system(size: 40, weight: .heavy)).foregroundStyle(.white.opacity(0.85))
                }
                Text("The Zen of Web3. Your QoreChain wallet, now on your phone.")
                    .foregroundStyle(Color.zeniMuted).multilineTextAlignment(.center)
            }.padding(.bottom, 20)
            VStack(spacing: 14) {
                Button("Create a new wallet") { generate() }
                    .buttonStyle(ZeniPrimaryButtonStyle()).disabled(working)
                Button("I already have a wallet") {
                    clearSecrets(); error = nil; step = .importPhrase
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 50).zeniSurface(radius: 25)
                .disabled(working)
                Text("QoreChain Diana Testnet · Chain 9800")
                    .font(.caption).foregroundStyle(Color.zeniMuted).padding(.top, 8)
            }

        }.frame(maxWidth: .infinity)
    }

    private var backup: some View {
        VStack(alignment: .leading, spacing: 20) {
            heading("Your recovery phrase", "Write these 12 words down in order and store them offline. Anyone with them can access your wallet.")
            if revealed {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(Array(phrase.split(separator: " ").enumerated()), id: \.offset) { index, word in
                        HStack {
                            Text("\(index + 1).").foregroundStyle(Color.zeniMuted)
                            Text(String(word)).fontWeight(.semibold)
                            Spacer(minLength: 0)
                        }
                        .font(.system(.callout, design: .monospaced))
                        .padding(12).zeniSurface(radius: 12)
                    }
                }.privacySensitive()
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "eye.slash").font(.largeTitle)
                    Text("Make sure no one is looking at your screen.").multilineTextAlignment(.center)
                }.frame(maxWidth: .infinity).padding(28).zeniSurface()
            }
            Button(revealed ? "Hide recovery phrase" : "Reveal recovery phrase") { revealed.toggle() }
                .frame(maxWidth: .infinity, minHeight: 44)
            RecoveryPhraseCopyButton(phrase: phrase)
                .disabled(working || phrase.isEmpty)
            Toggle("I saved all 12 words in a safe place.", isOn: $backedUp).font(.subheadline)
            Button("Check my backup") {
                revealed = false; answers = ["", "", ""]; step = .verify
            }.buttonStyle(ZeniPrimaryButtonStyle()).disabled(!backedUp)
        }
    }

    private var verification: some View {
        VStack(alignment: .leading, spacing: 20) {
            heading("Check your backup", "Enter these words from your saved recovery phrase before creating the wallet.")
            ForEach(challenges.indices, id: \.self) { index in
                VStack(alignment: .leading, spacing: 8) {
                    Text("Word \(challenges[index] + 1)").font(.caption).foregroundStyle(Color.zeniMuted)
                    SecureField("Recovery word", text: $answers[index])
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(16).zeniSurface().privacySensitive()
                }
            }
            Button("Continue") {
                let words = phrase.split(separator: " ").map(String.init)
                guard challenges.enumerated().allSatisfy({ index, position in
                    words.indices.contains(position) && KeyDerivation.normalizeMnemonic(answers[index]) == words[position]
                }) else { error = "Those words don’t match. Check your backup and try again."; return }
                answers = ["", "", ""]; error = nil; step = .protect
            }.buttonStyle(ZeniPrimaryButtonStyle()).disabled(answers.contains { $0.isEmpty })
        }
    }

    private var importForm: some View {
        VStack(alignment: .leading, spacing: 20) {
            heading("Bring your wallet", "Enter your recovery phrase to use the same account as your Zeni extension. Your extension password is not needed.")
            RecoveryPhraseTextBox(phrase: $importedPhrase)
                .disabled(working)
            Text("Supports valid 12, 15, 18, 21, or 24-word BIP-39 phrases. Your phrase stays on this device.")
                .font(.caption).foregroundStyle(Color.zeniMuted)
            Button("Continue") {
                working = true; error = nil
                Task {
                    defer { working = false }
                    do {
                        let normalized = KeyDerivation.normalizeMnemonic(importedPhrase)
                        guard try await state.validateRecoveryPhrase(normalized) else {
                            error = "That recovery phrase is invalid. Check the words and their order."; return
                        }
                        phrase = normalized; importedPhrase = ""; step = .protect
                    } catch { self.error = error.localizedDescription }
                }
            }.buttonStyle(ZeniPrimaryButtonStyle()).disabled(working || importedPhrase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private var protection: some View {
        VStack(alignment: .leading, spacing: 22) {
            Image(systemName: "faceid").font(.system(size: 52)).foregroundStyle(Color.zeniAccent)
            heading("Make it yours", "Protect your recovery phrase with this iPhone’s Keychain and Face ID or Touch ID.")
            VStack(alignment: .leading, spacing: 14) {
                Label("Device passcode and enrolled biometrics required", systemImage: "lock.shield")
                Label("Authenticate each transaction or message signature", systemImage: "iphone")
                Label("Keep your recovery phrase to restore on another device", systemImage: "key")
            }.font(.subheadline).padding(20).zeniSurface()
            Text("Changing enrolled biometrics can make the saved phrase inaccessible. Your offline backup is the way to recover your wallet.")
                .font(.caption).foregroundStyle(Color.zeniMuted)
            Button("Secure wallet & get started") { finish() }
                .buttonStyle(ZeniPrimaryButtonStyle()).disabled(working || state.isAuthenticating)
        }
    }

    private func heading(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
            Text(subtitle).font(.subheadline).foregroundStyle(Color.zeniMuted)
        }
    }

    private func generate() {
        working = true; error = nil; clearSecrets()
        Task {
            defer { working = false }
            do { phrase = try await state.generateRecoveryPhrase(); step = .backup }
            catch { self.error = error.localizedDescription }
        }
    }

    private func finish() {
        working = true; error = nil
        Task {
            defer { working = false }
            do {
                let context = LAContext()
                var authError: NSError?
                guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &authError) else {
                    error = "Set up a device passcode and Face ID or Touch ID in Settings, then try again."; return
                }
                let approved = try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Secure your Zeni wallet on this iPhone")
                guard approved else { return }
                try await state.importWallet(mnemonic: phrase)
                clearSecrets()
            } catch { self.error = error.localizedDescription }
        }
    }

    private func goBack() {
        error = nil; revealed = false
        switch step {
        case .verify: step = .backup
        case .protect:
            if backedUp { step = .verify } else { phrase = ""; step = .importPhrase }
        default: clearSecrets(); step = .welcome
        }
    }

    private func clearSecrets() {
        phrase = ""; importedPhrase = ""; answers = ["", "", ""]
        revealed = false; backedUp = false
    }
}

private struct RecoveryPhraseTextBox: View {
    @Binding var phrase: String
    @ScaledMetric(relativeTo: .body) private var editorHeight = 160

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Secret recovery phrase")
                .font(.caption).foregroundStyle(Color.zeniMuted)
            TextEditor(text: $phrase)
                .font(.system(.body, design: .monospaced))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .scrollContentBackground(.hidden)
                .frame(height: editorHeight)
                .overlay(alignment: .topLeading) {
                    if phrase.isEmpty {
                        Text("Type or paste your recovery words here…")
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(Color.zeniMuted)
                            .padding(.horizontal, 5).padding(.vertical, 8)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }
                }
                .padding(12)
                .zeniSurface()
                .privacySensitive()
                .accessibilityLabel("Secret recovery phrase")
        }
    }
}

private struct RecoveryPhraseCopyButton: View {
    let phrase: String
    @State private var copiedAt: Date?

    var body: some View {
        VStack(spacing: 8) {
            Button {
                guard !phrase.isEmpty else { return }
                UIPasteboard.general.setItems(
                    [[UTType.utf8PlainText.identifier: phrase]],
                    options: [
                        .localOnly: true,
                        .expirationDate: Date.now.addingTimeInterval(120)
                    ]
                )
                copiedAt = .now
            } label: {
                Label(copiedAt == nil ? "Copy recovery phrase" : "Copied!",
                      systemImage: copiedAt == nil ? "doc.on.doc" : "checkmark")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .zeniSurface(radius: 14)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Copies all recovery words in order so you can paste them into your backup.")
            Text("Clipboard clears after 2 minutes.")
                .font(.caption).foregroundStyle(Color.zeniMuted)
        }
        .task(id: copiedAt) {
            guard copiedAt != nil else { return }
            do {
                try await Task.sleep(for: .seconds(2))
                copiedAt = nil
            } catch {}
        }
        .onChange(of: phrase) { copiedAt = nil }
    }
}

private struct OnboardingLandscape: View {
    private static let image: UIImage? = {
        guard let path = Bundle.main.path(forResource: "zen-landscape-blended", ofType: "png") else { return nil }
        return UIImage(contentsOfFile: path)
    }()

    var body: some View {
        GeometryReader { geometry in
            if let image = Self.image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottom)
                    .clipped()
                    .mask(
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0),
                                .init(color: .black, location: 0.5),
                                .init(color: .black, location: 1)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
            }
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
}

#Preview("Import phrase text box") {
    RecoveryPhraseTextBox(phrase: .constant(""))
        .padding(24)
        .background(Color.zeniBackground)
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
}

#Preview("Recovery phrase copy") {
    VStack(alignment: .leading, spacing: 20) {
        Text("Your recovery phrase").font(.largeTitle.bold())
        RecoveryPhraseCopyButton(phrase: "Preview words only")
    }
    .padding(24)
    .background(Color.zeniBackground)
    .foregroundStyle(.white)
    .preferredColorScheme(.dark)
}

#Preview("Welcome artwork") {
    WalletOnboardingView(state: AppState())
}

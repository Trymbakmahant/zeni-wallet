import SwiftUI

@main
public struct ZeniApp: App {
    @StateObject private var appState = AppState()
    @State private var isPrivacyMaskActive: Bool = false

    public init() {}

    public var body: some Scene {
        WindowGroup {
            ZStack {
                PortfolioView(state: appState)

                // Privacy snapshot mask
                if isPrivacyMaskActive {
                    ZStack {
                        Color.zeniBackground.ignoresSafeArea()
                        VStack(spacing: 12) {
                            Text("銭")
                                .font(.system(size: 48, weight: .bold))
                                .foregroundColor(.zeniPurple)
                            Text("Zeni")
                                .font(.headline)
                                .foregroundColor(.white)
                        }
                    }
                    .transition(.opacity)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in
                withAnimation(.easeInOut(duration: 0.15)) {
                    self.isPrivacyMaskActive = true
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                withAnimation(.easeInOut(duration: 0.15)) {
                    self.isPrivacyMaskActive = false
                }
            }
        }
    }
}

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

@main
public struct ZeniApp: App {
    @Environment(\.scenePhase) private var scenePhase
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
            .onChange(of: scenePhase) {
                withAnimation(.easeInOut(duration: 0.15)) {
                    self.isPrivacyMaskActive = (scenePhase != .active)
                }
            }
        }
    }
}

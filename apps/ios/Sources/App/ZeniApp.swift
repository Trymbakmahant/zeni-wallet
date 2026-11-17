import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

@main
public struct ZeniApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var appState = AppState()
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
                            ZeniBrandMark()
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
                    if scenePhase == .background { appState.lock() }
                }
            }
        }
    }
}

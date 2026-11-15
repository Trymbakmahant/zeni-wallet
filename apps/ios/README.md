# Zeni iOS Native App (Swift & SwiftUI)

Zeni is a native, self-custodial iOS wallet application built in Swift 5.10 and SwiftUI for iOS 17+.

## Features
- **Biometric Keychain Security**: Master cryptographic entropy protected by Secure Enclave hardware biometrics (`kSecAccessControlBiometryCurrentSet`).
- **Post-Quantum Hybrid Signatures**: Classical `secp256k1` + `ML-DSA-87` (NIST FIPS 204 Dilithium-5).
- **In-Memory Zeroization**: Sensitive buffers wrapped in `SecureData` with immediate zeroing on deallocation.
- **Privacy Snapshot Shield**: Automatic blur overlay when the app is placed in the background or during app-switching.

---

## How to Run in Xcode

### Method 1: Using the Xcode Project (Recommended)
1. Double-click `apps/ios/Zeni.xcodeproj` or run:
   ```bash
   open apps/ios/Zeni.xcodeproj
   ```
2. In the top toolbar scheme selector, choose **Zeni** and select an iOS Simulator (e.g., **iPhone 16 Pro** or **iPhone 15 Pro**).
3. Press **⌘R** (or click the Play button) to build and run.

### Method 2: Opening the Swift Package
1. In Xcode, select **File → Open...**
2. Navigate to and select the `apps/ios` folder (or `apps/ios/Package.swift`).
3. Xcode will automatically resolve the Swift Package targets.

### Testing Biometrics in the iOS Simulator
To test Face ID in the iOS Simulator:
1. Open the Simulator menu: **Features → Face ID → Enrolled** (to simulate registered Face ID).
2. When prompted for Face ID inside the app, select **Features → Face ID → Matching Face**.

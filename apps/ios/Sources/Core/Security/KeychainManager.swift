import Foundation
import Security
import LocalAuthentication

/// Manages biometric-locked key storage in Apple iOS Keychain
public final class KeychainManager {
    public static let serviceName = "io.qorechain.zeni.vault"
    public static let masterAccount = "master-keyring"

    public static func createBiometricAccessControl() throws -> SecAccessControl {
        var error: Unmanaged<CFError>?
        guard let accessControl = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            [.biometryCurrentSet],
            &error
        ) else {
            if let error { throw error.takeRetainedValue() as Error }
            throw NSError(domain: "ZeniKeychain", code: -1, userInfo: [NSLocalizedDescriptionKey: "Could not create biometric protection."])
        }
        return accessControl
    }

    public static func saveMasterEntropy(data: Data) throws {
        let accessControl = try createBiometricAccessControl()

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: masterAccount,
            kSecValueData as String: data,
            kSecAttrAccessControl as String: accessControl
        ]

        // Import must never delete an existing wallet if saving a replacement fails.
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let existing = try loadMasterEntropy(prompt: "Authenticate to restore your saved wallet")
            guard existing == data else {
                throw NSError(domain: "ZeniKeychain", code: -2, userInfo: [NSLocalizedDescriptionKey: "A different wallet is already saved on this device. Import its original recovery phrase; the saved wallet has not been replaced."])
            }
            return
        }
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: nil)
        }
    }

    public static func loadMasterEntropy(prompt: String = "Authenticate to unlock your Zeni wallet") throws -> Data {
        let context = LAContext()
        context.localizedReason = prompt

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: masterAccount,
            kSecReturnData as String: true,
            kSecUseAuthenticationContext as String: context
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: nil)
        }
        return data
    }
}

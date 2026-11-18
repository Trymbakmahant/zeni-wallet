# Apply the accounts and Activity update in Xcode

This update adds Account 2/3 creation and switching, incoming/external on-chain Activity, refresh and older-history controls, and account-isolated signing and transaction reviews. The existing Account 1 is retained. The compiled `WalletEngine.html` resource is included.

## Apply the files

If you are opening this repository on the same Mac, the source files are already updated: open `apps/ios/Zeni.xcodeproj` and build. No manual replacement is needed.

If you are using another checkout, extract `zeni-ios-accounts-activity-update.zip`. Copy each file under its `apps/ios/` directory over the matching file in your checkout. Preserve the directory paths and all other existing files. Do not replace the entire Sources folder or create duplicate Swift files in Xcode. No changes to signing, project references, or your development team are required.

The changed runtime files are:

- `Sources/App/AppState.swift`
- `Sources/App/TransactionViews.swift`
- `Sources/App/ZeniConnectController.swift`
- `Sources/Core/Network/WalletTransactionEngine.swift`
- `Sources/Core/Network/WalletEngine.html`
- `Sources/Features/Portfolio/Views/PortfolioView.swift`

The ZIP also contains the changed engine source, simulator tests, and documentation. Keep `WalletEngine.html` in the app's **Copy Bundle Resources** phase; it is already registered in the existing project. This prebuilt resource lets you build in Xcode without running Node. If you regenerate it later, use the complete updated repository, including its shared core changes.

1. Open `apps/ios/Zeni.xcodeproj`, choose **Zeni**, and select your iPhone or simulator.
2. Choose **Product → Clean Build Folder** (⇧⌘K), then run (⌘R).
3. Run tests (⌘U). They use a public test phrase and mock chain responses; they never broadcast real transactions or write that phrase to Keychain.

## Check the features

- Tap the account name at the top left → **Add account**. Authenticate to create Account 2; repeat for Account 3. Switch between them, then restart the app to verify the selection persists. Each account has its own addresses, balance, history, and PQC registration. Switching disconnects dApps; reconnect to use the new account.
- Send testnet QOR to the selected account from another wallet. Open **Activity**, refresh, and verify the confirmed incoming transfer appears with an explorer link. Test **Load older activity** if history has more pages. Turn off networking and refresh to verify cached rows remain visible with an error.
- Fund Account 2 with testnet QOR and review a small transfer. Review any required first-use PQC registration and fee, then authenticate. Confirm the transaction and sender in the explorer. Real-device Keychain and funded-chain execution remain manual checks.
- In Simulator, use **Features → Face ID → Enrolled** and **Matching Face** when prompted.

History covers indexed native transfers, swaps, and plain EVM QOR transfers. ERC-20 log-only transfers, internal EVM traces, SVM activity, and unindexed history may be absent. Remote history is cached in memory, while Zeni's local broadcast journal remains persisted separately.

To restore additional accounts from a recovery phrase, import the phrase and add accounts again in the same order. No new recovery phrase is created for additional accounts.

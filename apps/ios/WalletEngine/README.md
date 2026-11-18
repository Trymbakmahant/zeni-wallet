# iOS transaction engine

The native SwiftUI forms call the same `AmmSwapClient`, `QorTransferClient`, and key derivation code used by the extension. The bundled HTML runs locally in a nonpersistent WebKit process, with remote scripts and direct networking disabled. URLSession relays requests only to the two QoreChain Diana endpoints. Wallet phrases are stored only in the biometric-protected Keychain; activity files contain public transaction information.

After changing shared TypeScript transaction code, regenerate the checked-in resource from `apps/ios`:

```sh
node Scripts/build-wallet-engine.mjs
```

This uses the repository's installed extension dependencies. It does not download JavaScript at runtime. Keep `WalletEngine.html` in the app's Copy Bundle Resources phase (already registered by Xcode).

## Validation

Select the **Zeni** scheme and an iPhone simulator, then run tests (Command-U) using the Debug configuration. Its test plan includes **ZeniTransactionTests**, which loads the app's Debug library. The Swift Testing suite runs the bundled WebKit engine on the simulator with a public reference mnemonic. A custom URLProtocol supplies deterministic chain responses; tests never fund accounts, write recovery phrases to Keychain, or broadcast to the real network. They cover derivation, quote precision and fee reserves, registration, transfer authorization, real signed hashes, receipt-derived output, unknown broadcast status, public-only balance/quote reads, authentication for each signature, cancelled authentication, and cancellation when the app backgrounds.

Select the **Zeni** scheme to run the app. Go to **Settings → Manage Wallet / Import Wallet** to import the extension's recovery phrase or view the selected account's public addresses. Tap the account header to select or add accounts. Balances, activity, connection approval, and transaction previews use public account metadata and do not unlock the Keychain. Each confirmed transfer, swap, or message signature reads the Keychain with a fresh authentication context; signing keys are released afterward. A device passcode and enrolled Face ID/Touch ID are required for wallet setup and signing. QOR sends use spendable native bank balances, six-decimal amounts, and hybrid-signed bank transfers; swaps use native bank balances with 6/18/8 decimal token units. First-time PQC registration is a classical-signed bootstrap with proof of possession. Faucet-token sends remain unavailable because the extension's corresponding path is a simulation.

No funded-device end-to-end transaction was performed during implementation. Keychain authentication and live-chain execution still need verification on a funded Diana testnet wallet.


## Accounts and on-chain Activity

The account picker derives Account 2, Account 3, and subsequent accounts from the same recovery phrase and indices as the extension. Adding requires fresh device authentication; switching uses public metadata, cancels pending reviews, and disconnects apps. The selected index is saved and used for each signing authorization. Existing installations migrate Account 1 automatically. After restoring a phrase, add accounts in the same order to recover their addresses; balances and PQC registrations belong to each address separately.

Activity uses the shared `AccountActivityClient` against the official Diana REST and EVM endpoints. Reads never unlock the Keychain. Native incoming/outgoing transfers, swaps, and indexed plain EVM QOR transfers are merged with the local broadcast journal using actual receipt hashes and explicit EVM hash aliases. Failed transactions are not presented as received money. Pagination is anchored to a block height, account switches reject stale results, and cached rows remain visible on network failure. Remote activity remains in memory (up to 500 rows per cached account); only the local broadcast journal is persisted. ERC-20 log-only transfers, internal EVM traces, and SVM history are outside this reader's scope.

Simulator tests also cover distinct account derivation/restoration, invalid indices, account-isolated history, incoming-transfer deduplication, offline retention, legacy journal decoding, invalidation of old transaction reviews, and signing a transfer from Account 2. All chain responses are mocked; no real funds are sent.

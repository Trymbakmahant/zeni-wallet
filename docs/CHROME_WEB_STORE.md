# Chrome Web Store beta 0.1.6

## Listing copy

**Zeni — Self-Custody Wallet for QoreChain**

Zeni is a browser wallet for QoreChain’s Diana Testnet. Create or import a wallet, manage testnet assets, swap tokens, and connect to supported web applications.

**Key features**

- **Send QOR:** Native QOR transfers combine a classical secp256k1 signature with an ML-DSA-87 post-quantum signature.
- **Manage accounts:** Use one recovery phrase for your EVM-format and native QoreChain addresses. Your recovery phrase and wallet keys are stored locally in a vault encrypted with PBKDF2-SHA256 and AES-GCM.
- **Trade:** Explore testnet markets and price history from on-chain swaps. Review estimated output, minimum received, slippage, and fees before swapping through a native liquidity pool.
- **Connect to apps:** Supported websites can discover Zeni through EIP-6963. Review the requesting site before sharing an account. Message signatures, transfers, and supported EVM contract calls require separate approval.
- **Manage permissions:** Use Apps to disconnect websites or create and revoke scoped agent sessions with spending limits and an expiry. An agent uses its own session key, not your recovery phrase.

**Updating to 0.1.6:** Wallet creation and import now accept passwords of at least six characters, with inline feedback for short or mismatched entries. A longer, unique password is recommended. Existing users keep their wallet and password when updating through the same Chrome Web Store listing.

**Testnet and privacy:** Zeni currently supports QoreChain Diana Testnet. Network and setup fees may apply. Initial post-quantum key registration is a separate transaction. Standard app message signing (`personal_sign`) uses classical ECDSA, not ML-DSA-87. Blockchain transactions are public, and Zeni sends network requests to QoreChain RPC services. See the [privacy policy](https://zeni-wallet.vercel.app/privacy.html).

## Upload package

Run `pnpm zip:ext` from the repository root. Upload `artifacts/extension/zeni-wallet-extension-0.1.6.zip` directly; do not unzip and repackage its parent folder. The script also refreshes the root `zeni-wallet-extension.zip` for existing local workflows. It starts from a fresh archive to avoid retaining older hashed bundles and compares every archived file with the current build. Packaging also copies the ZIP to `apps/web/public/downloads/` and generates `apps/web/src/extension-release.json`; the landing page imports this version/filename rather than maintaining a separate download version. The web build rejects missing ZIPs, checksum mismatches, and mismatched release versions/manifests. Include the versioned public download in the release commit and deploy the web app after packaging.

The manifest name matches the listing title. Use the existing store item to preserve the extension ID and wallet storage.

## Website scope

The wallet provider runs in the main world and the bridge runs in an isolated world, at document start in the top frame, on:

- `https://*/*`
- `http://localhost/*`
- `http://127.0.0.1/*`

This enables third-party apps and local development. Only the `storage` API permission is requested. Network host permissions remain `https://api-testnet.qore.host/*` and `https://evm-testnet.qore.host/*`. There are no arbitrary RPC endpoints or remotely hosted scripts. Account access and signing require origin-specific approval; public chain reads are forwarded through a bounded method allowlist.

## Privacy practices fields

### Single purpose

Zeni is a self-custody wallet for QoreChain Diana Testnet. Users can manage testnet assets, send native QOR, swap supported tokens, and approve wallet connections and signing requests from connected websites, including contract calls and deployments on Diana.

### Storage permission

Zeni uses chrome.storage.local to persist its locally encrypted wallet vault, public account identifiers, approved website origins and transaction activity. This lets users reopen the wallet without importing it again. Recovery phrases and private keys are stored encrypted; public account metadata and activity are stored separately. The extension does not use Chrome synchronized storage.

### Host permissions

Zeni connects to https://api-testnet.qore.host/* and https://evm-testnet.qore.host/* to query Diana Testnet balances, account state, liquidity pools, fees and transaction status, and submit user-approved signed transactions. Its content scripts make the wallet discoverable on HTTPS websites and HTTP localhost/127.0.0.1 development pages. The provider exposes public chain reads; account access and signing require user approval. These matches are necessary for developers to integrate Zeni without a new extension release for each website. Scripts run only in the top frame. Private keys, passwords and recovery phrases are never sent to these sites or RPC services.

### Privacy policy URL

https://zeni-wallet.vercel.app/privacy

Data-handling disclosures and certifications must match the extension and this policy. Restricting website permissions does not eliminate local wallet data processing, financial information, connected-site metadata, or network metadata received by RPC providers.

## Before submitting

1. If an older version is awaiting review, use the dashboard's available cancel/withdraw action before uploading the replacement when required.
2. Upload the version 0.1.6 ZIP and confirm the displayed version, name and permission lists match the above. If the store has already received this version, bump the patch version and rebuild before uploading a replacement.
3. Update the host justification and listing text to describe third-party website discovery, contract approvals, and the local development scope, save the draft, and confirm your publisher email is verified.
4. Confirm the public privacy policy loads and describes the same scope. Submit the updated package for review.

Version 0.1.4 adds broad website content-script matches. Review the permission changes in the dashboard and update the privacy disclosures before submitting. It is a local test build until you publish it; existing store installations retain their installed capabilities.

## Version 0.1.6 checks

Extract the ZIP to a stable folder and load it unpacked in `chrome://extensions`. For an existing unpacked installation, replace its files and click **Reload**; avoid removing it, which deletes local wallet data. Verify version **0.1.6**, refresh the app, and reconnect.

Follow [the contract transaction guide](CONTRACT_TRANSACTIONS.md) to deploy, verify, deposit, and withdraw at `/vault`. Test both approval and rejection. Review shows the recipient or deployment, value and maximum fee. Calldata, gas and authorization details expand on demand. **Authorize & send** approves the transaction and required setup without a separate checkbox.

Regression checks: `pnpm --filter @zeni/extension test:security` checks permission boundaries, quotes, rejection, lock and disconnect. `CHROME_BIN="/path/to/extension-capable-chromium" pnpm --filter @zeni/extension test:browser:extension` exercises the real extension with chain networking blocked. `CHROME_BIN="/path/to/extension-capable-chromium" VAULT_URL="http://127.0.0.1:3019/vault" pnpm --filter @zeni/extension test:browser:vault` exercises the real vault page and approval UI against local Anvil with simulated native setup. This does not validate public testnet acceptance; complete the manual test before submitting.

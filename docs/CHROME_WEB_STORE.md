# Chrome Web Store beta 0.1.3

## Upload package

Run `pnpm zip:ext` from the repository root. Upload `artifacts/extension/zeni-wallet-extension-0.1.3.zip` directly; do not unzip and repackage its parent folder. The script also refreshes the root `zeni-wallet-extension.zip` for existing local workflows. It starts from a fresh archive to avoid retaining older hashed bundles and compares every archived file with the current build. Packaging also copies the ZIP to `apps/web/public/downloads/` and generates `apps/web/src/extension-release.json`; the landing page imports this version/filename rather than maintaining a separate download version. The web build rejects missing ZIPs, checksum mismatches, and mismatched release versions/manifests. Keep the versioned ZIP allowed in `.gitignore` and deploy the web app after packaging.

This version is named **Zeni Wallet — QoreChain Testnet**. Update any manually entered listing title that still says “Quantum-Proof Smart Wallet.” It is a self-custody testnet wallet, not a guarantee of immunity to quantum attacks or an ERC-4337 smart account.

## Website scope

Both provider injection and access to the injected script are restricted to:

- `https://zeni-connect-demo.vercel.app/*`
- `https://zeni-wallet.vercel.app/*`

Network host permissions remain restricted to:

- `https://api-testnet.qore.host/*`
- `https://evm-testnet.qore.host/*`

Only the `storage` API permission is requested. There are no wildcard website hosts, HTTP sites, localhost, `activeTab`, `scripting`, or optional host permissions in this release. Browser-extension wallet discovery works on the two Zeni websites only. Other apps can use mobile QR connection with an allowed relay origin, or an explicitly scoped development build. A development domain must be added to both manifest match lists; never upload that development build as this store release.

## Privacy practices fields

### Single purpose

Zeni is a self-custody wallet for QoreChain Diana Testnet. Users can manage testnet assets, send native QOR, swap supported tokens, and approve wallet connections and signing requests from the Zeni demo and documentation playground.

### Storage permission

Zeni uses chrome.storage.local to persist its locally encrypted wallet vault, public account identifiers, approved website origins and transaction activity. This lets users reopen the wallet without importing it again. Recovery phrases and private keys are stored encrypted; public account metadata and activity are stored separately. The extension does not use Chrome synchronized storage.

### Host permissions

Zeni connects to https://api-testnet.qore.host/* and https://evm-testnet.qore.host/* to query Diana Testnet balances, account state, liquidity pools, fees and transaction status, and submit user-approved signed transactions. Its content scripts and injected wallet provider are restricted to https://zeni-connect-demo.vercel.app/* and https://zeni-wallet.vercel.app/* so the Zeni demo and docs playground can discover the wallet and request connections. Account access and signing require user approval. No content script runs on other websites. Private keys, passwords and recovery phrases are never sent to these sites or RPC services.

### Privacy policy URL

https://zeni-wallet.vercel.app/privacy

Data-handling disclosures and certifications must match the extension and this policy. Restricting website permissions does not eliminate local wallet data processing, financial information, connected-site metadata, or network metadata received by RPC providers.

## Before submitting

1. If an older version is awaiting review, use the dashboard's available cancel/withdraw action before uploading the replacement when required.
2. Upload the version 0.1.3 ZIP and confirm the displayed version, name and permission lists match the above.
3. Update the host justification and listing text to describe the two-site beta limitation, save the draft, and confirm your publisher email is verified.
4. Confirm the public privacy policy loads and describes the same scope. Submit the updated package for review.

The release removes broad-host match patterns. Google may still review its exact-host permissions and financial functionality; these changes do not guarantee approval or a particular review time.


## Version 0.1.3 checks

This release includes multiple accounts, incoming/indexed on-chain Activity, and automatic review windows for website connection, message signing, and QOR transfer requests. A single extension-owned review window is reused and focused. Closing it rejects queued requests; a transaction already approved and submitted must still be checked in Activity. If Chrome cannot open the window, the pending request remains available from the toolbar badge. No additional permissions or website hosts were added.

For an unpacked installation, extract the new ZIP over the same existing extension folder and click **Reload** for Zeni in `chrome://extensions`. Verify version **0.1.3**, then refresh the demo/docs website and reconnect. Do not remove the existing extension to update it: removal deletes its local wallet data. Store installations receive the update after the new ZIP is reviewed and published.

Check **Account 1 → Add account**, incoming transfers in **Activity**, and automatic review opening from the demo for **Connect**, **Sign message**, and **Review transfer**. The supported websites remain the two domains listed above.


Regression checks: `pnpm --filter @zeni/extension test:security` verifies approval window bounds, rejection, and fallback behavior. `APPROVAL_WINDOW=1 pnpm --filter @zeni/extension test:browser` exercises the built review UI, accounts, and Activity with mocked transport. `CHROME_BIN="/path/to/extension-capable-chromium" pnpm --filter @zeni/extension test:browser:extension` loads the real extension in an isolated profile, checks automatic windows and a public-fixture message signature, and rejects the transfer with chain networking blocked. Use Chromium, Chrome for Testing, or Brave; branded Chrome builds may disable command-line extension loading.

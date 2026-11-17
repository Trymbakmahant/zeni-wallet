# Chrome extension release security review

Date: 2026-11-17

**Verdict: not cleared for a real-funds production release.** The code is configured exclusively for QoreChain Diana Testnet (EVM 9800 / `qorechain-diana`). The changes below make a testnet beta safer, but a fresh-profile Chrome acceptance pass and the Web Store privacy/listing review remain release gates. No extension was uploaded or published.

## Signing follow-up (2026-11-17)

The extension now accepts readable `personal_sign` messages and ordinary QOR `eth_sendTransaction` requests after explicit wallet review. The bridge forwards bounded signing parameters; the worker validates the origin, account, chain, and intent. Transfers require the exact reviewed fee quote and reuse the existing QOR authorization, broadcast, and Activity path. Lock, expiry, and page-disconnect guards apply before signing/broadcast. Typed data and contract calls still fail closed. The original review below predates this addition; its account-only provider description is historical.

Follow-up checks: 17 extension security tests and 50 core tests; extension typecheck and extension/demo builds; browser checks of the built approval UI with a fake wallet transport; demo provider tests with mocked extension requests and relay access blocked. No live transfer was broadcast during these checks, and installed-extension/network acceptance remains outstanding.

## Scope and evidence

Reviewed the extension service worker, content/inpage bridge, popup security flows, manifest/CSP, shared vault/derivation and transaction code, dependency advisories, and generated extension files. Existing unrelated iOS/web/portfolio edits were preserved. This was a source and automated regression review, not an independent cryptographic audit of QoreChain, its SDK, or deployed contracts.

Validation completed:

- `pnpm --filter @zeni/core test`: 38 passed, including real signature/wire-format checks with mocked chain responses, KDF compatibility, authenticated encryption, uncertain submission tracking, and lock-before-broadcast checks.
- `pnpm --filter @zeni/extension test:security`: 9 passed. These exercise the service-worker message handlers with mocked Chrome APIs, not a running browser.
- `pnpm --filter @zeni/extension typecheck`: passed.
- `pnpm --filter @zeni/extension build`: passed with Vite 6.4.6. There is still a large shared bundle warning and an upstream annotation warning.
- Generated manifest entry files exist; content and inpage bundles parse as classic scripts; no source maps are shipped. The two textual `eval(` matches in the shared bundle are polynomial evaluation methods, not JavaScript eval.
- Narrow credential-pattern scan of 79 tracked text files found no matches. This does not cover Git history, ignored files, arbitrary mnemonic disclosure, or every credential format.
- Latest `pnpm audit --json`: no findings attributed to the extension dependency path after upgrading Vite/esbuild. The workspace audit still reports **9 advisories (1 high, 7 moderate, 1 low)**, all attributed to `apps/web > vite` / its esbuild dependency. Those web development dependencies were not upgraded as part of this extension review.

## Issues corrected

| Severity | Finding | Change |
| --- | --- | --- |
| High | dApp sends and non-QOR sends returned fabricated hashes; unsupported signing requests could hang. | Removed simulated sends. Unsupported dApp signing/transactions return error 4200; non-QOR sends are rejected and removed from the send selector. |
| High | QOR broadcast success was immediately labeled CONFIRMED; uncertain submissions and setup transactions were not durably recorded by the extension. | Save real native/EVM hashes before broadcast; keep submissions PENDING until receipts confirm them; preserve pending activity and block another transaction from the same account while its outcome is unresolved. |
| High | CREATE/UNLOCK responses unnecessarily contained the classical private key, PQ seed, and mnemonic-bearing context. | Responses now return a success boolean; keys remain in the background vault. Password-verified recovery export remains an explicit operation. |
| Medium | Vault creation could replace an existing vault and relied on popup credential validation. | Validate mnemonic and a 12–1024-character new password in the background; reject overwriting an existing vault and concurrent vault mutations. Existing shorter-password vaults can still unlock. |
| Medium | Locking during async decryption could be followed by the in-flight unlock restoring the vault. Timer-only expiry could lag when execution was suspended. | Add vault-generation checks and a wall-clock deadline; clear quotes/approvals on lock; popup polls session state and hides secret views after locking. |
| Medium | Approval expiry was stored but never enforced; requests could open repeated windows and survive a disconnected page. | Enforce expiry, one pending approval per origin and five globally, require an unlocked wallet for approval, remove requests on disconnect, and use the toolbar badge for review. |
| Medium | dApp ports had insufficient sender/message validation. | Require the same extension ID, a top-level HTTP(S) tab, and matching sender URL/origin; validate IDs/method names and strip unneeded page parameters. |
| Medium | Local extension storage was available to content scripts by default. | Restrict local storage to TRUSTED_CONTEXTS before processing messages. The existing privileged-message sender guard is covered by regression tests. |
| Medium | Build tooling had known Vite/esbuild vulnerabilities. | Upgrade the extension to Vite 6.4.6 / esbuild 0.25.12. Remaining workspace findings are in the separate web app. |
| Low | The vault accepted unbounded/unvalidated envelope parameters and used synchronous JavaScript PBKDF2. | Validate envelope version/algorithms/hex lengths and bound KDF work; use WebCrypto PBKDF2 with the existing 600,000-iteration SHA-256 format; clear temporary byte buffers. Compatibility and tampering tests pass. |
| Low | Recovery-export state retained the phrase/password after closing; approval favicons loaded site-controlled URLs; security status text claimed PQC was active without checking registration. | Clear export state, use a local approval icon, constrain CSP resources, and label the current network Testnet. |

Other hardening: HTTP(S)-only content injection, no remote executable code in the manifest, only `storage` permission, RPC hosts limited to the two configured HTTPS endpoints, request timeout/error-code propagation, a valid EIP-6963 UUID, and a minimum Chrome version of 124 for the platform APIs in use.

## Remaining release gates and limitations

1. **Real Chrome validation is outstanding.** Load `apps/extension/dist` in a fresh profile and check installation/CSP errors, creation, recovery import, wrong-password handling, export and lock behavior, background-worker restart, dApp connect/reject/expiry, and error 4200 for unsupported signing. Use a disposable testnet wallet for a transfer and swap; verify actual explorer receipts and balances. Test an offline/uncertain submission and confirm that another send is blocked until its outcome is resolved. Test upgrading a copy of an existing encrypted vault.
2. **Web Store disclosures need owner review.** Verify the listing and privacy-policy URL describe address/balance queries sent to QoreChain RPC providers, public on-chain transactions, local encrypted vault storage, HTTP(S) page injection for the provider, and the testnet/unsupported-method limitations. No privacy-policy document was found in the files reviewed. Check store screenshots, branding, and icons in the final package.
3. **Provider compatibility is limited.** The injected provider supports chain queries and account connection only. Transaction signing, typed-data signing, and personal signing are deliberately unavailable; account/chain change event APIs are not implemented. There is no per-site connection revocation screen yet.
4. **Uncertain transactions deliberately block retries.** Automatic dropped/replaced-transaction resolution is not implemented. A crash between saving a hash and submitting it, or locking during that interval, may leave an unsent transaction marked pending. Do not clear/reset history just to retry without checking the chain. Existing activity from older demo builds may contain fabricated or prematurely confirmed records; this review cannot certify that legacy history.
5. **Security/product claims still need restraint.** Portfolio USD values are hardcoded estimates, not a price feed. The settings PQC description is informational rather than a live attestation. Mnemonic backup uses a checkbox instead of a word-confirmation challenge. Clipboard copies of recovery phrases remain on the system clipboard until replaced. JavaScript strings and garbage collection prevent guaranteed erasure of all secret copies from memory.
6. **Mainnet release requires separate work.** Network/deployment configuration, wallet SDK/chain security assurances, live end-to-end confirmation and recovery tests, and accurate signing previews must be established before advertising support for real funds. This review does not establish those properties.

Rebuild after any further changes, review only the contents of `apps/extension/dist` for submission, and do not package the repository or local wallet profiles.

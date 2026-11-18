# Zeni Connect v1

This implementation connects an integrated web app to the native Zeni iOS wallet using an encrypted QR/deep-link session and a self-hosted relay. It is a Zeni-specific protocol, not a WalletConnect-compatible relay. It is a testnet beta implementation, not a production security certification.

## What is included

- `apps/relay`: standalone Node HTTP service, bounded encrypted mailboxes, one-time QR credential rotation, revocation, expiry, CORS/origin admission, Docker Compose/Caddy HTTPS deployment.
- `packages/connect-protocol`: typed wire format and WebCrypto AES-GCM implementation.
- `packages/connect`: JS/TS provider, QR event, account connection, request/response flow, error codes, cancellation, and a wallet adapter.
- `packages/react`: `ZeniConnectProvider`, `useZeni`, and `ZeniConnectButton` with local QR rendering and an iOS deep link.
- `apps/connect-demo`: working React app that requests a message signature, verifies it locally, and requests a QOR transfer.
- iOS: Connect entry on the home screen, camera scanning, pasted/deep-link pairing, site approval, message/transfer review, local signing, result delivery, and disconnect.

Supported methods are account/chain queries, `eth_requestAccounts`, `personal_sign` for readable UTF-8 messages, and `zeni_sendQor` for QOR transfers to ordinary wallet addresses on Diana (9800). QOR recipients may use a checksummed `qor1…` address or an EVM `0x…` address; the wallet shows the EVM equivalent before signing. Every signing request needs explicit approval in the selected wallet. Requests with calldata, unsupported chain/account, custom gas/nonce, invalid amounts, or hidden/binary message contents are rejected. Message signatures are standard EIP-191 ECDSA. Existing QoreChain registration and native fee limits apply to transfers.

This work does not add a gas-sponsoring transaction relayer, chain history indexer, Android app, push service, contract-call signing, or WalletConnect interoperability.

## Browser extension

The Chrome Web Store beta (extension 0.1.1) injects its provider only on `https://zeni-connect-demo.vercel.app` and `https://zeni-wallet.vercel.app`. Other domains, preview deployments and localhost do not receive the injected provider. For another app, use the mobile SDK with an allowed relay origin, or build a development extension with that exact HTTPS origin added to both `content_scripts.matches` and `web_accessible_resources.matches`. Adding a domain to the mobile relay allowlist does not change extension permissions.

The demo’s **Browser extension** option discovers Zeni through EIP-6963 or `window.zeni`. It calls the injected provider directly; it does not use the relay or create a QR session. The React/JS mobile SDK remains the QR transport.

The extension supports reviewed `personal_sign` messages and `zeni_sendQor` QOR transfers on Diana, with the same validation limits described above. Open Zeni from the Chrome toolbar to review the website origin, signing account, message or transfer details, and the maximum network/setup fees before approving. Typed-data signing and contract calls remain unsupported.

After updating the source, build with `pnpm --filter @zeni/core build` and `pnpm --filter @zeni/extension build`. Reload the unpacked extension at `chrome://extensions`, refresh the web app, and reconnect. An older installed extension will still reject signing with error 4200. Local demo disconnect does not revoke the extension’s stored site permission.

## Hosted endpoints

- Connect demo: https://zeni-connect-demo.vercel.app
- Relay origin: https://zeni-wallet.onrender.com
- Health endpoint: https://zeni-wallet.onrender.com/healthz

Use the relay origin as `relayUrl` in the SDK. The demo uses it by default in production builds; `VITE_ZENI_RELAY_URL` overrides that default. Local development still defaults to `http://localhost:8787`. Each web app’s exact origin must be in the relay’s `ALLOWED_ORIGINS` allowlist.

## Run locally

From the repository root, using Node 22+ and pnpm:

```sh
pnpm install
pnpm build:connect
pnpm dev:relay
```

In a second terminal:

```sh
pnpm dev:connect
```

Open `http://localhost:5174`. The local relay is `http://localhost:8787`.

For iOS, regenerate the bundled engine after any shared signing changes:

```sh
node apps/ios/Scripts/build-wallet-engine.mjs
```

Build and run the Zeni target in Xcode. On first launch, create a wallet and confirm its recovery-phrase backup, or import an existing phrase. Complete Face ID/Touch ID setup to protect it in the Keychain. Existing wallets open the portfolio. Tap the **QR scanner in the top-right corner**, then scan the QR from the demo, or paste its `zeni://connect#...` link. The same-device **Open Zeni** link invokes the registered URL scheme. After connecting, the React button provides **Open Zeni to approve requests** (`zeni://request`) so mobile-browser users can return to the existing wallet session.

An iOS Simulator shares access to the Mac's localhost; the simulator cannot use the physical-camera scanner, so use the deep link or pasted URI. Physical phones need a publicly reachable **HTTPS** relay. Set `VITE_ZENI_RELAY_URL=https://zeni-wallet.onrender.com` when starting/building the demo and follow `apps/relay/README.md` for Docker deployment. Release iOS builds reject plaintext HTTP; Debug allows localhost only. Do not weaken this for a public deployment.

Approve the connection, then request a signature or transfer from the website. Keep Zeni foregrounded during requests. Unlocking is required again after the app backgrounds. A returned transfer hash means submission, not confirmation; use the explorer and wallet activity for receipt status.

## Integrate/distribute the SDK

See `packages/connect/README.md` for plain JavaScript/TypeScript and `packages/react/README.md` for React examples. The packages are not published to npm. They work through workspace dependencies in this repository. To distribute local tarballs:

```sh
pnpm build:connect
pnpm --dir packages/connect-protocol pack --pack-destination ../../artifacts/connect-sdk
pnpm --dir packages/connect pack --pack-destination ../../artifacts/connect-sdk
pnpm --dir packages/react pack --pack-destination ../../artifacts/connect-sdk
```

Install the protocol and provider tarballs together in a consuming app; include the React tarball for React bindings. `pnpm pack` converts workspace ranges into version ranges. Publishing the scoped packages to a registry and configuring a public relay/domain are separate owner actions; neither has been performed here.

For npm release preparation, run `pnpm check:sdk-release`. It checks the actual archives and installs them into an isolated consumer using React 18 and 19. See [the npm release guide](NPM_RELEASE.md) for scope access, publication order, and registry verification.

## Wire format

The browser creates a relay session with its Origin and display name. The relay returns separate browser and wallet bearer credentials. The browser generates a 32-byte encryption key locally and builds:

```text
zeni://connect#v=1&relay=<encoded HTTPS origin>&session=<32 hex characters>&token=<wallet pairing token>&key=<32-byte base64url key>
```

Only the QR/deep link carries the encryption key. Never log the link or submit it to remote QR rendering/analytics. The wallet fetches site metadata, asks the user to connect, then exchanges its pairing credential for a new session credential. The original QR token is invalid after that exchange.

Messages use AES-256-GCM, fresh 12-byte nonces, and UTF-8 JSON. Ciphertext includes the 16-byte tag at the end; all binary values use unpadded base64url. Authenticated additional data is exactly:

```text
zeni-connect:v1:<session ID>:<sender role dapp|wallet>:<frame UUID>
```

Frame schema: `{id, iv, ciphertext}`. Decrypted types: `approved`, `rejected`, `request`, `response`, `disconnect`. Request IDs, expiry, session/role binding, and single-use wallet review IDs prevent replay from becoming an additional signature. A relay can observe traffic metadata, drop/delay messages, or deny service; it cannot decrypt them without the QR key. Site Origin is reported by the relay, not independently domain-verified, and users must check it against the address bar.

## Operational limits

Sessions and credentials are memory-only. Relay restart, wallet termination, browser reload, or network failure may require reconnecting. Pairings last five minutes and approved sessions up to one hour. Requests last five minutes; wallet reviews last two minutes. The iOS wallet supports up to eight concurrent app sessions, each with its own encrypted mailbox and one pending request. Tap the app card below the wallet header to see connected apps and their recent requests. New requests open a review prompt without replacing another active review. Names and logos are display metadata; always check the website origin. The app icon uses the site’s public `/favicon.ico`, with an initial as the fallback. Only one outstanding request per browser provider is allowed. The SDK never automatically re-signs a timed-out transaction. Check wallet activity before retrying.

The included server/proxy is a bounded single-instance beta deployment. Horizontal scaling, persistence, push notifications, distributed rate limiting, domain verification, and production observability require further implementation and review. Camera permission, biometric approval on a physical device, and live funded testnet transfers must be verified before public rollout.

## Validation

- `pnpm test:connect`: core intent/signing tests plus relay and SDK round-trip tests. Network tests bind loopback only and never broadcast funds.
- `pnpm build:connect`: protocol/provider/React TypeScript builds and production demo build.
- With both local servers running: `pnpm --filter @zeni/connect-demo test:browser` launches a separate temporary Chrome profile, renders a QR, connects through the actual local relay, requests a real signature from a test wallet adapter, verifies it in the browser, and disconnects. Set `CHROME_BIN` for your Chrome executable outside macOS.

Validation completed on 2026-11-17: 48 core tests, 3 relay tests, 4 SDK tests, 9 existing extension security tests, and 14 iOS simulator tests passed (78 total). The real Chrome QR/signature round trip passed. TypeScript/demo and iOS builds passed, package tarballs were created, relay `/healthz` returned OK, and Docker Compose configuration validated. No live blockchain transaction was sent.
- Xcode Zeni tests include WebCrypto-to-CryptoKit ciphertext compatibility, altered-frame/direction rejection, actual local message signatures, single-use review enforcement, locking, and dApp transfer preparation/execution against mocked chain responses.

The domain, TLS deployment, npm publication, physical-camera scan and live funded phone transaction are not claimed as completed by these automated tests.

Native QOR transfers use `zeni_sendQor`, with the `[{ from, to, value, chainId }]` request shape. `value` remains a hexadecimal amount in 18-decimal EVM units for integration convenience, but must be an exact multiple of 10^12 (native QOR has 6 decimals). The result is a 64-character native Cosmos transaction ID without `0x`; use the native explorer/receipt API. `eth_sendTransaction` is disabled instead of silently returning a non-Ethereum receipt. Transfers are hybrid-signed bank `MsgSend` transactions, with no EVM window or classical EVM fallback. First-time PQC key registration is a separate classical-signed bootstrap with proof of possession; subsequent transfers carry both signatures. Existing classical transactions cannot be retroactively upgraded. Message signing remains classical EIP-191.


The landing site's `/docs#playground` embeds mobile QR and browser-extension connections, message signature verification, and native QOR transfer review. The code panel shows the same request parameters sent by the playground and retains the last submitted request. `/docs#ai-prompt` provides a copyable integration prompt customized by app name and React or JavaScript/TypeScript stack.

The docs playground uses `VITE_ZENI_RELAY_URL` when provided, defaults to the hosted relay in production, and defaults to `http://localhost:8787` in development. The docs site's exact origin must be on the relay allowlist for mobile pairing; extension connections do not use the relay. Build the shared packages before the web app (`pnpm --filter @zeni/web... build`).

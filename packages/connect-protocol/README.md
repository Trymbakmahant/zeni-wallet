# @zeni/connect-protocol

Wire types and WebCrypto AES-256-GCM primitives shared by the Zeni Connect SDK. Most web apps should use `@zeni/connect` or `@zeni/react`.

## Installation

The first npm release is being prepared; these packages are not published yet. Use the local tarballs described in the [SDK guide](https://github.com/Trymbakmahant/zeni-wallet/blob/main/docs/ZENI_CONNECT.md) until publication is confirmed. Release maintainers should follow the [npm release guide](https://github.com/Trymbakmahant/zeni-wallet/blob/main/docs/NPM_RELEASE.md).

This package is ESM and includes TypeScript declarations. Browser integrations require a secure context with WebCrypto and modern fetch/AbortSignal support.

Frames bind protocol version, session ID, sender role, and frame ID as authenticated additional data. Ciphertext contains the 16-byte authentication tag appended to the encrypted JSON, matching CryptoKit on iOS. Each frame has a fresh 12-byte nonce. Keys are generated from 32 random bytes and transferred only in a `zeni://connect#...` QR/deep-link fragment.

See `docs/ZENI_CONNECT.md` in the repository for the full protocol and deployment limits.

# @zeni/connect-protocol

Wire types and WebCrypto AES-256-GCM primitives shared by the Zeni Connect SDK. Most web apps should use `@zeni/connect` or `@zeni/react`.

Frames bind protocol version, session ID, sender role, and frame ID as authenticated additional data. Ciphertext contains the 16-byte authentication tag appended to the encrypted JSON, matching CryptoKit on iOS. Each frame has a fresh 12-byte nonce. Keys are generated from 32 random bytes and transferred only in a `zeni://connect#...` QR/deep-link fragment.

See `docs/ZENI_CONNECT.md` in the repository for the full protocol and deployment limits.

# Zeni (銭) — Quantum-Proof Smart Wallet

Zeni is a dual-platform Web3 wallet (Chrome Extension & Native iOS Swift App) built specifically for **QoreChain** (EVM Chain ID `9800`).

## Key Features

- **Hybrid Cryptography**: Dual-key authorization combining classical `secp256k1` with post-quantum `ML-DSA-87` (NIST FIPS 204 Dilithium-5).
- **ERC-4337 Smart Accounts**: On-chain quantum protection through custom smart account verification using QoreChain's native `pqcVerify` precompile (`0x0000000000000000000000000000000000000A01`).
- **Gasless Onboarding**: Paymaster sponsorship for zero-cost initial transactions.
- **In-Wallet Swaps**: Automated liquidity routing across QoreChain testnet assets (`QOR`, `fUSD`, `fETH`, `fBTC`).
- **Multi-Platform**: Manifest V3 browser extension and native iOS application with Secure Enclave & FaceID protection.

## Monorepo Architecture

```
zeni-wallet/
├── apps/
│   ├── extension/     # Chrome / Brave Manifest V3 Extension (TypeScript + React + Vite)
│   ├── ios/           # Native Apple iOS App (SwiftUI + Keychain biometrics)
│   └── web/           # Landing page & interactive web sandbox demo
├── packages/
│   ├── contracts/     # Foundry project (ZeniSmartAccount, ZeniAccountFactory, ZeniPaymaster)
│   └── core/          # Shared crypto, key derivation, and QoreChain RPC engine
```

## Quick Start

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- Foundry (`forge`)

### Installation & Build
```bash
# Install workspace dependencies
pnpm install

# Build smart contracts
pnpm build:contracts

# Run contract test suite
pnpm test:contracts

# Run extension in development
pnpm dev:ext

# Run web landing sandbox
pnpm dev:web
```

### Chrome extension QOR transfers

Build the shared core and extension, then load `apps/extension/dist` as an unpacked extension at `chrome://extensions`. For an existing installation, click **Reload** and unlock the wallet again.

```bash
pnpm --filter @zeni/core build
pnpm --filter @zeni/extension build
pnpm --filter @zeni/core test
```

Choose **Review Transfer**, inspect the fee allowance and authorization limits, then **Authorize & Send**. On Diana testnet, the first send registers the wallet's ML-DSA-87 public key with proof of possession. Each confirmed send authorizes one native QOR transfer to the selected recipient for 60 blocks, with a value limit covering the amount plus EVM gas. Registration and authorization are confirmed on the native lane before the extension reads the updated EVM nonce and signs the transfer.

The wallet needs QOR for setup as well as the transfer. Setup transactions are simulated and their fees must fit the reviewed allowance; successful setup fees remain charged if a later step fails. This flow supports ordinary wallet recipients. Contract calls and the existing demo-token flows are separate.

Existing encrypted vaults retain their addresses and PQC seeds; unlocking corrects the old seed-hash placeholder to the actual public-key hash. A different registered PQC key is never overwritten. This preserves Zeni's existing mnemonic-derived PQC recovery scheme; it does not introduce the SDK's separate recovery-code scheme.

The transfer regression tests use mocked network responses and real signing/transaction encoding. A funded Chrome testnet transfer is still needed to validate the full deployed-node path.

## License
MIT

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

## License
MIT

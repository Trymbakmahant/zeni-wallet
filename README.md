# Zeni (銭) — QoreChain Testnet Wallet

Zeni is a dual-platform Web3 wallet (Chrome Extension & Native iOS Swift App) built specifically for **QoreChain** (EVM Chain ID `9800`).

## Key Features

- **Hybrid Cryptography**: Dual-key authorization combining classical `secp256k1` with post-quantum `ML-DSA-87` (NIST FIPS 204 Dilithium-5).
- **Live PQC Registration Status**: Reads Diana’s key-status precompile and compares the registered ML-DSA-87 key with the unlocked wallet.
- **PQC Diagnostics**: Read-only signature/precompile checks requiring no wallet secrets or gas. Regular transactions still require QOR for fees.
- **In-Wallet Swaps**: Automated liquidity routing across QoreChain testnet assets (`QOR`, `fUSD`, `fETH`, `fBTC`).
- **Multi-Platform**: Manifest V3 browser extension and native iOS application with Secure Enclave & FaceID protection.

The ERC-4337 account/factory/paymaster sources are experimental and are not used by the extension’s live transaction path. Daily spending limits, gas sponsorship, hybrid SIWQ login, and a Cross-VM bridge flow are not shipped features.

See [PQC verification and testing](docs/PQC-VERIFICATION.md) for extension 0.1.2, the read-only diagnostic, supported behavior, and limitations.

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

Choose **Review Transfer**, inspect the recipient, amount, and maximum fees, then **Authorize & Send**. QOR sends are native bank `MsgSend` transactions signed with both ML-DSA-87 and classical secp256k1. Amounts support six decimal places and use spendable bank balances. First-time key registration is a separate classical-signed bootstrap with proof of possession; the transfer itself is hybrid signed. There is no EVM authorization window or classical EVM fallback. Connect apps must use `zeni_sendQor`, which returns a native 64-character transaction ID without `0x`.

The wallet needs QOR for setup as well as the transfer. Setup transactions are simulated and their fees must fit the reviewed allowance; successful setup fees remain charged if a later step fails. This flow supports ordinary wallet recipients. Contract calls and the existing demo-token flows are separate.

Existing encrypted vaults retain their addresses and PQC seeds; unlocking corrects the old seed-hash placeholder to the actual public-key hash. A different registered PQC key is never overwritten. This preserves Zeni's existing mnemonic-derived PQC recovery scheme; it does not introduce the SDK's separate recovery-code scheme.

The transfer regression tests use mocked network responses and real signing/transaction encoding. A funded Chrome testnet transfer is still needed to validate the full deployed-node path.

### Native AMM swaps

The extension swaps QOR, fUSD, fETH and fBTC through Diana's `x/amm` module using active direct pools. Quotes, swap fees and price impact come from the public REST API; the signed `MsgSwapExactIn` enforces the reviewed minimum output. Pairs without an active direct pool are unavailable. Faucet assets are read from spendable bank balances with their official, case-sensitive denominations and 6/18/8 token decimals. ERC-20 balances that have not been converted to bank coins are not available to this swap flow.

Open **Swap**, enter an amount, choose **Review Swap**, then **Confirm & Swap**. First use can register the wallet's PQC key; the swap itself is hybrid-signed on the native lane and does not need an EVM authorization window. Actual network fees are simulated within the displayed allowance. Setup fees remain charged if a later step fails.

The real native transaction hash is saved before broadcasting. A swap is shown as confirmed only after a successful chain receipt, with the received amount read from receipt events. **View on Explorer** is available on the result screen and in **Activity**. Select **Testnet** in the Dashboard explorer: its network is controlled by its header/cookie, not by the transaction URL. Pending or uncertain broadcasts remain in Activity across popup restarts and block another send from the account until their outcome is known; clearing history preserves those records. Old simulated swap entries are labelled as demos and have no explorer link.

Run `pnpm --filter @zeni/core test` for signing, slippage, denomination, fee, confirmation and uncertain-broadcast regression coverage. Live pools, quotes, token metadata and an existing AMM receipt were read to verify the integration; these checks do not spend wallet funds.

## License
MIT

# Verify Zeni's PQC checks

Zeni's current extension is a self-custody Diana testnet wallet. Native QOR
transfers and native AMM swaps use the existing hybrid signing path. Website
`personal_sign` requests still use ECDSA. The extension does not route spending
through `ZeniSmartAccount`, enforce daily/per-transaction caps, implement hybrid
SIWQ login, or offer a Cross-VM bridge operation. Two address formats are not
proof of Cross-VM execution. Installing a package does not implement a feature.

## Extension 0.1.2

1. Run `pnpm --filter @zeni/core build` and `pnpm --filter @zeni/extension build`.
2. Open `chrome://extensions`, enable Developer mode, and load
   `apps/extension/dist` with **Load unpacked**. Reload an existing unpacked
   installation after building. To install the ZIP, extract it and load the
   extracted directory; Chrome does not load the ZIP directly.
3. Unlock Zeni and open **Settings → Post-Quantum Key Registration**.
4. Check the status and block number. **Refresh registration** reads Diana again.
   No signature approval or gas is needed. A matching registered key is explicitly
   distinguished from an unregistered account, different registered key, and an
   unavailable RPC. The key hash is the keccak256 hash of the on-chain public key.
5. Disconnect the network and refresh: the UI must show an unavailable status,
   not retain the previous success. Reconnect and refresh to recover.

The status comes from the `pqcKeyStatus` EVM precompile at `0x…0a02`, at the
reported block. It checks Diana chain ID 9800 and ML-DSA-87 key shape. It does not
prove possession, open an EVM window, or certify overall account security. The
existing transfer path separately checks registration/key binding and proof of
possession before signing. Registration may change after a snapshot.

For existing transaction functionality, connect at
https://zeni-connect-demo.vercel.app (or the embedded landing-page demo), use
**Send testnet QOR**, review the recipient, amount, and fee in Zeni, and inspect
the resulting native receipt at https://explore.qore.network. This spends testnet
QOR and requires an explicit approval. A regular **Sign message** operation is
ECDSA and must not be described as a hybrid SIWQ login.

## Read-only network diagnostic

From the repository root:

```sh
pnpm --filter @zeni/contracts prove 0xYOUR_PUBLIC_ACCOUNT_ADDRESS
```

Use an EVM address, not a recovery phrase or private key. `PRIVATE_KEY` is not
read. The command uses only public `eth_chainId`, `eth_blockNumber`, and
`eth_call` requests to the fixed Diana RPC. It never deploys or broadcasts,
requires no balance/open window, and does not alter the account.

The JSON report separates:

- Whether that account has a supported registered PQC key, with its public hash.
- Whether `pqcVerify` at `0x…0a01` accepts a valid signature from a newly generated,
  disposable test key AND rejects the same signature on an altered message.
- Whether a signature from the account's registered key was supplied and verified.
  By default this is `not supplied`. A disposable-key check is not account proof.

A network/check failure exits nonzero. An unregistered account is a valid status
result (`registered: false`), never a successful registration claim.

An optional public JSON file can contain `{ "message": "0x…", "signature": "0x…" }`:

```sh
pnpm --filter @zeni/contracts prove 0xYOUR_PUBLIC_ACCOUNT_ADDRESS /path/to/public-proof.json
```

`message` must contain the exact signed bytes (1–4096 bytes), including any signer
prefix/domain; `signature` must be a 4,627-byte ML-DSA-87 signature. Verification
uses the key fetched for that account, both locally and through the precompile.
Do not use a wallet export as this file. The extension does not yet expose an
arbitrary PQC-message signing method; its ECDSA `personal_sign` result cannot be
used here. Even a valid public proof is not a replay-protected login session.

## Solidity demonstration and limits

`ZeniFeatureProver` is a non-custodial precompile demonstration, not a wallet or
policy contract. `verifyKeyStatus(account)` reverts unless registration is valid;
`verifyRegisteredSignature(account, signature, message)` reads that account's
registered key and reverts on invalid signatures. It emits no success event when
verification fails. A third party can relay a public signature, and the contract
deliberately grants no authority. It cannot receive funds through a payable method.

The fake `setSpendingRule`, `verifySiwqSession`, and `touchCrossVm` functions were
removed. No production smart-account deployment or account migration is included.
The existing `ZeniSmartAccount` source now uses the correct typed PQC ABI and
rejects malformed verifier responses, but this is not a full ERC-4337/account
security audit. It remains outside the extension's live transaction path.

There is intentionally no automatic deploy/broadcast runner. Deploying a contract
is a separate, reviewed operation requiring an appropriate PQC-authorized EVM
window and fees. Do not export an existing wallet key to run a feature showcase.

QoreChain's [FAQ](https://build.qorechain.io/faq) says the Solidity PQC signature and
key-status features are reviewed manually in the repository. These diagnostics
cannot guarantee Verified badges. Genuine SIWQ authentication, chain-enforced
spending rules, and Cross-VM execution need their own implementation and evidence.

## Regression checks

```sh
pnpm --filter @zeni/core test
pnpm --filter @zeni/contracts test
pnpm --filter @zeni/extension typecheck
pnpm --filter @zeni/extension build
pnpm --filter @zeni/extension test:security
pnpm --filter @zeni/extension test:browser
```

The browser check uses a disposable Chrome profile and fake wallet/RPC responses;
it sends no transactions and covers approval regression and registration states.
Set `CHROME_BIN` if Chrome is not installed at the default macOS path.
The Solidity tests mock Diana precompiles; the read-only live diagnostic above
checks the actual network implementation separately.

# Contract transactions and Vault Lab (extension v0.1.4)

The new development build supports `eth_sendTransaction` on QoreChain Diana (9800): contract calls, standard token approvals, and deployment. This is separate from the mobile QR SDK, which still supports only `personal_sign` and `zeni_sendQor`. A published older extension does not gain this feature until you install the new build or publish the store update.

## Test it yourself

1. Run `pnpm zip:ext`. Extract `artifacts/extension/zeni-wallet-extension-0.1.4.zip` (or use `apps/extension/dist`). In `chrome://extensions`, enable Developer mode and **Load unpacked**. Disable the older Zeni extension during testing so provider discovery does not select it. Keep your existing recovery phrase backed up; use a disposable test wallet for this demo.
2. Run `pnpm build:vault`, then `pnpm dev:web`. Open the printed localhost URL with `/vault` appended. The demo is also deployable at `/vault` on the existing web project.
3. Create/import a test wallet in the extension, fund it with Diana testnet QOR from https://dashboard.qorechain.io/faucet, and click **Connect Zeni** on the demo. Approve the connection.
4. Click **Deploy test vault**. Check the origin, destination and maximum fee. Expand **Transaction details** to inspect bytecode, gas and the one-transaction authorization window, then click **Authorize & send**. Registration and authorization may take several blocks before the EVM hash is returned.
5. Wait for confirmation. The new address appears in the vault field. The demo automatically checks its exact runtime bytecode and enables deposits when it matches. Saved addresses are checked again after reconnecting or reloading. Use **Recheck vault** to retry a failed check.
6. Deposit a small amount, e.g. **0.01 QOR**. Approve in Zeni and wait for the balance to update. Withdraw the same amount and approve again. Each action is a real contract transaction with gas/setup fees.
7. Also try Reject, closing the approval window, an amount above your deposit, locking the wallet, and reloading with a pending transaction. Rejection must not broadcast; a missing response must never cause an automatic retry.

The contract has no owner or yield: each address may withdraw only its own deposit. It rejects zero amounts and uses checks/effects plus a reentrancy guard. This is a testnet integration demo, not a production vault product.

## Integrate your app

Use `useBrowserWallet()` from `@zeni-wallet/react`, or discover `window.zeni` / EIP-6963 (`io.qorechain.zeni`). Call `eth_requestAccounts` on user action. Then send a request through that provider:

```ts
import { Interface, parseEther, toQuantity } from 'ethers';
const abi = new Interface(['function deposit() payable']);
const hash = await provider.request({
  method: 'eth_sendTransaction',
  params: [{ from: account, to: vaultAddress,
    data: abi.encodeFunctionData('deposit'),
    value: toQuantity(parseEther('0.01')), chainId: '0x2648' }],
});
const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
```

Poll receipts with a delay: null is pending, status `0x1` is success, `0x0` is a reverted transaction. Returning a hash means submitted, not confirmed. On an uncertain broadcast Zeni persists the locally computed hash in Activity; do not automatically resubmit. The demo also saves its last transaction across reloads.

For deployment omit `to` and pass bytecode as `data`. Standard ERC-20 approvals are ordinary calls to the token contract. A swap router must be deployed on Diana. Typed-data signing, Permit/Permit2 signatures, EIP-7702 delegation, raw transaction signing, access lists, custom nonces, and other chains are not supported. Use standard approve-and-swap transactions instead of a permit-dependent flow.

## QoreChain authorization

The review explicitly authorizes PQC registration if necessary, followed by a hybrid-signed EVM window for **one transaction**, **120 blocks**, and the reviewed **native value plus maximum gas cost**. Calls restrict the window to the reviewed recipient; deployment cannot restrict it to a pre-existing target. Token allowances and internal contract effects are not bounded by a native QOR budget.

Setup fees are part of the displayed maximum and may be spent even when a later step fails. An unused window remains until expiry. The EVM transaction uses a classical secp256k1 signature; the window is what carries PQC authorization. Never describe the EVM transaction itself as hybrid signed. The nonce is read only after native setup commits, since Cosmos and EVM share the account sequence.

Zeni estimates gas, blocks simulation failures, rechecks estimates after setup, and does not increase the reviewed gas/fee cap. It accepts legacy or EIP-1559 fees. A fee increase or wallet change requires a new review.

## Verification

`pnpm --filter @zeni/core test`, `pnpm --filter @zeni/extension test:security`, and `forge test --root packages/contracts --match-contract ZeniTestVaultTest` cover validators, authorization signing, fee/nonce behavior, rejection and locking, and vault accounting. The browser contract test uses a fresh browser profile, public fixture keys, a local Anvil chain, and simulated QoreChain authorization endpoints; it never broadcasts to public testnet.

With Anvil installed, the web server running, and the extension built, run:

```sh
CHROME_BIN="/path/to/Brave Browser or Chrome for Testing" \
VAULT_URL="http://127.0.0.1:3019/vault" \
pnpm --filter @zeni/extension test:browser:vault
```

Set `ANVIL_BIN` if Anvil is not on your PATH. The test checks real EVM receipts and balances, validates authorization signatures and shared nonces, and confirms that rejection sends nothing. Public Diana acceptance still requires the manual test above.

## Store release

v0.1.4 broadens content-script matches to HTTPS apps and HTTP loopback development origins. Review and update store permission/privacy disclosures before submitting this new ZIP. No store upload or public-chain deployment is performed by these development commands.

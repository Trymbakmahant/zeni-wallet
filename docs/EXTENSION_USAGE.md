# Using the Zeni extension

Detailed account, Activity, native-transfer, and swap behavior on QoreChain Diana testnet. For installation and developer integration, see the [main README](../README.md). For EVM calls and deployments, see [contract transactions](CONTRACT_TRANSACTIONS.md).

## Multiple extension accounts

Click the account name in the top-left corner, choose **Add account**, and enter
this wallet's password. Zeni derives Account 2, Account 3, and subsequent accounts
from your existing recovery phrase. Each has its own EVM/native addresses, PQC key,
balance, and activity. Creation is local and free; each account needs its own
QOR balance for transaction fees. Up to 100 accounts are supported.

Choose an account in the same selector to switch. The selection survives locking
and restarting the extension. Switching cancels pending approvals and old fee
quotes, and websites must reconnect with your approval. It is blocked while a
transaction is executing. To restore additional accounts after importing the
phrase on another installation, add them again in the same order.

## Incoming and external activity

The extension's Activity tab merges local records with committed Diana transaction
history from the official Cosmos REST API. It includes incoming QOR and supported
bank-token payments, transfers made outside Zeni, swaps, self-transfers, and indexed
EVM QOR transfers. Receipts determine amounts and status; fees are not counted as
received funds. Native and EVM hashes are linked only through receipt evidence.

Open **Activity** to refresh, use the refresh icon to check again, and choose
**Load older activity** for additional pages (up to 500 chain transactions).
While the tab is open, it checks every 30 seconds. Switching accounts clears the
view and ignores late responses for the previous account. API failures show an
error and retain available local/session-cached records. Chain history is fetched
again after a service-worker restart. Clearing completed local records does not
remove public chain history or pending transactions.

History uses `message.sender`, `transfer.sender`, `transfer.recipient`, and EVM
recipient event queries, with a fixed block height for pagination. It is not a
complete EVM log/trace index: token movements only visible inside contract logs,
SVM-only activity, and unindexed/pruned history may be absent. Unknown denominations
are shown in base units instead of guessing decimals. No extra Chrome permissions,
explorer API key, or private-key export is required. The explorer itself uses the
same public endpoints: https://docs.qorechain.io/dashboard/explorer.

## Chrome extension QOR transfers

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

## Native AMM swaps

The extension swaps QOR, fUSD, fETH and fBTC through Diana's `x/amm` module using active direct pools. Quotes, swap fees and price impact come from the public REST API; the signed `MsgSwapExactIn` enforces the reviewed minimum output. Pairs without an active direct pool are unavailable. Faucet assets are read from spendable bank balances with their official, case-sensitive denominations and 6/18/8 token decimals. ERC-20 balances that have not been converted to bank coins are not available to this swap flow.

Open **Swap**, enter an amount, choose **Review Swap**, then **Confirm & Swap**. First use can register the wallet's PQC key; the swap itself is hybrid-signed on the native lane and does not need an EVM authorization window. Actual network fees are simulated within the displayed allowance. Setup fees remain charged if a later step fails.

The real native transaction hash is saved before broadcasting. A swap is shown as confirmed only after a successful chain receipt, with the received amount read from receipt events. **View on Explorer** is available on the result screen and in **Activity**. Select **Testnet** in the Dashboard explorer: its network is controlled by its header/cookie, not by the transaction URL. Pending or uncertain broadcasts remain in Activity across popup restarts and block another send from the account until their outcome is known; clearing history preserves those records. Old simulated swap entries are labelled as demos and have no explorer link.

Run `pnpm --filter @zeni/core test` for signing, slippage, denomination, fee, confirmation and uncertain-broadcast regression coverage. Live pools, quotes, token metadata and an existing AMM receipt were read to verify the integration; these checks do not spend wallet funds.

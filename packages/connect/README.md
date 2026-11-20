# @zeni-wallet/connect

JavaScript/TypeScript provider for **Zeni Connect v1**, the Zeni mobile wallet's custom encrypted QR connection protocol. This protocol is not WalletConnect and does not accept WalletConnect QR codes.

## Installation

```bash
npm install @zeni-wallet/connect
```

## Browser integration

```ts
import { ZeniProvider } from '@zeni-wallet/connect';

const provider = new ZeniProvider({
  relayUrl: 'https://zeni-wallet.onrender.com',
  name: 'Your application',
});

provider.on('display_uri', (uri: string) => {
  // Render this URI with a LOCAL QR library, or use it as an <a href> on mobile.
  // It contains a pairing secret. Never send it to analytics, remote QR services, or logs.
  showLocalQRCode(uri);
});
provider.on('accountsChanged', (accounts: string[]) => updateAccounts(accounts));
provider.on('disconnect', () => clearWalletUI());

const [account] = await provider.connect(); // resolves after approval on the phone
const hash = await provider.request({
  method: 'zeni_sendQor',
  params: [{ from: account, to: '0xRECIPIENT', value: '0x38d7ea4c68000', chainId: '0x2648' }],
}); // 0.001 QOR; confirmed native transaction ID without 0x

const signature = await provider.request({
  method: 'personal_sign',
  params: ['0x68656c6c6f', account], // UTF-8 "hello", hex encoded
});

await provider.disconnect();
```

Handle promise rejections: 4001 means rejection/expiry, 4100 means not connected, 4200 means unsupported method, 4900 means disconnected, and -32002 means another request is pending. Check wallet activity before retrying a transfer whose response timed out.

`on(event, listener)` and `removeListener(event, listener)` support `display_uri`, `connect`, `accountsChanged`, and `disconnect`. The only chain is Diana testnet (`0x2648` / 9800), so there is no chain-switch operation. Local account/chain queries use `eth_accounts`, `eth_chainId`, and `net_version`; `eth_requestAccounts` invokes `connect()`.

Only QOR transfers to ordinary wallet addresses are supported. Nonempty calldata, contract creation, ERC-20/NFT transfers, typed-data signing, raw signing, custom nonce/gas fields, and mainnet are rejected. QoreChain native transfer/setup fees are reviewed on the phone. Message signatures use standard EIP-191 ECDSA; they are **not post-quantum signatures**.

For authentication, your server must issue a fresh, single-use challenge containing your domain, purpose, nonce, and expiry; verify the signature/account and consume the nonce. A valid generic message signature alone is not a complete login system.

## Lifecycle

Pairings expire after five minutes; approved sessions last up to one hour. Credentials remain in memory. Page reload, wallet termination, or relay restart requires reconnecting. Only one signing request may be outstanding. Requests expire after five minutes, while wallet reviews expire after two minutes. Keep the mobile app foregrounded; v1 has no push notifications/background delivery guarantee.

Requires a secure browser context with WebCrypto, `fetch`, `AbortSignal.timeout`, and `AbortSignal.any` (modern Chrome/Safari/Firefox). The site must be permitted by the relay's `ALLOWED_ORIGINS`. For physical phones use a publicly reachable HTTPS relay; localhost is only for same-machine development.

The relay sees IP addresses, site Origin/name, traffic timing, and ciphertext. The QR key is shared only between the two endpoints. Origin metadata is observed by the relay, not an independent domain-verification service. Treat QR links as secrets and verify the displayed website on the phone.

`ZeniWalletSession` is an adapter for wallet implementers and tests. Its `approve(account, handler)` callback must explicitly obtain user approval and independently validate each request before accessing a signer. A website must never hold a user's private key to implement this callback.

See [the repository guide](https://github.com/Trymbakmahant/zeni-wallet/blob/main/docs/ZENI_CONNECT.md) for deployment and local demo instructions.

The examples use Zeni’s hosted relay. Your web app’s exact origin must be added to its allowlist, or you can supply your own public HTTPS relay URL.

QOR transfers accept `qor1…` and `0x…` recipient addresses in the updated iOS wallet. Publish a PNG or ICO at your app origin’s `/favicon.ico` to show its logo in the wallet; the origin remains visible alongside the app name.

Native QOR transfers use `zeni_sendQor`, with the same `[{ from, to, value, chainId }]` request shape shown above. `value` remains a hexadecimal amount in 18-decimal EVM units for integration convenience, but must be an exact multiple of 10^12 (native QOR has 6 decimals). The result is a 64-character native Cosmos transaction ID without `0x`; use the native explorer/receipt API. `eth_sendTransaction` is disabled instead of silently returning a non-Ethereum receipt. Transfers are hybrid-signed bank `MsgSend` transactions, with no EVM window or classical EVM fallback. First-time PQC key registration is a separate classical-signed bootstrap with proof of possession; subsequent transfers carry both signatures. Existing classical transactions cannot be retroactively upgraded. Message signing remains classical EIP-191.

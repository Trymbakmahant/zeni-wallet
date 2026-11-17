# @zeni/react

React 18/19 bindings and a locally rendered QR connect button for Zeni's mobile wallet.

```tsx
import { ZeniConnectProvider, ZeniConnectButton, useZeni } from '@zeni/react';

export function App() {
  return (
    <ZeniConnectProvider relayUrl="https://zeni-wallet.onrender.com" name="Your application">
      <ZeniConnectButton />
      <WalletActions />
    </ZeniConnectProvider>
  );
}

function WalletActions() {
  const { provider, account, error } = useZeni();
  async function sign() {
    try {
      const signature = await provider.request({
        method: 'personal_sign', params: ['0x68656c6c6f', account],
      });
      // Verify the signature for your server-issued challenge before authenticating.
    } catch (error) {
      // Display the wallet's rejection/error in your UI.
    }
  }
  return <button disabled={!account} onClick={sign}>Sign in with Zeni</button>;
}
```

`useZeni()` exposes `provider`, `account`, `uri`, `connecting`, `error`, `connect()` and `disconnect()`. Use the hook for custom UI or `ZeniConnectButton` for the QR panel and same-device deep link. `connect()` reports errors through hook state; direct `provider.request()` calls reject with wallet error codes.

Follow the method and security limits in `@zeni/connect`: Diana testnet only, reviewed QOR transfers and readable message signing. This package uses Zeni Connect, not WalletConnect. The QR renderer is local and never uploads pairing secrets.

The examples use Zeni’s hosted relay. Your web app’s exact origin must be added to its allowlist, or you can supply your own public HTTPS relay URL.

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { REPOSITORY, ZENI_RELAY } from './content';

export function IntegrationPrompt() {
  const [appName, setAppName] = useState('My app');
  const [framework, setFramework] = useState('React + TypeScript');
  const prompt = `Integrate Zeni Wallet into my existing ${framework} application named ${JSON.stringify(appName.trim() || 'My app')}.
Preserve the app's current design and unrelated functionality.

Read the actual SDK APIs before writing code:
- Repository: ${REPOSITORY}
- Guide: ${REPOSITORY}/blob/main/docs/ZENI_CONNECT.md
- Mobile provider: packages/connect; React bindings: packages/react
- Working integration: apps/connect-demo; docs playground: apps/web/src/docs/ConnectPlayground.tsx

Installation:
The @zeni/connect-protocol, @zeni/connect, and @zeni/react packages are not published on npm. Build them from this repository with pnpm build:connect and install local tarballs together (protocol + connect, plus react for React apps), or use workspace dependencies inside the monorepo. Install ethers for encoding and signature verification, and qrcode for custom QR rendering. Do not invent an npm release.

Connection:
Offer Browser extension and Mobile wallet choices.
${framework === 'React + TypeScript' ? 'Use useBrowserWallet from @zeni/react for extension discovery, connection, account/network changes, and local disconnect. Use ZeniConnectProvider, useZeni, and ZeniConnectButton (or a custom local QR UI) for mobile.' : 'For extension discovery, use EIP-6963 (rdns io.qorechain.zeni) or window.zeni, check isZeni, and call eth_requestAccounts only after a user click. For mobile, use ZeniProvider from @zeni/connect, listen to display_uri, accountsChanged and disconnect, render the QR locally, and call connect() on user action.'}
The extension connects directly without a relay. For mobile use relayUrl ${ZENI_RELAY} and my app name; the app's exact origin must be allowlisted by the hosted relay operator, or use my own HTTPS relay. Never proxy requests to pretend my app is the demo origin. QR links contain secrets: never log, persist, or send them to remote QR services. Clean up providers, polling, and event listeners on unmount.

Network and requests:
Use QoreChain Diana only: chain ID 9800 / 0x2648. Validate the extension network and connected account before signing. Handle cancellation, rejection, expiry, lock/disconnect, account/network changes, pending requests and unsupported methods. Disable duplicate requests.
Message: personal_sign with params [hexlify(toUtf8Bytes(message)), account]. Accept readable UTF-8 up to 4096 bytes; reject hidden controls. Verify the result with verifyMessage against the requested account. These are classical EIP-191 signatures, not PQC signatures or a complete login system. Authentication requires a server-issued, single-use challenge with domain, nonce, purpose and expiry.
Transfer: zeni_sendQor with params [{ from: account, to: recipient, value: toQuantity(parseEther(amount)), chainId: '0x2648' }]. Validate qor1 or 0x wallet addresses, nonzero amounts and at most six decimal places. Value uses 18-decimal wei units but must be a multiple of 10^12. Do not use eth_sendTransaction. The wallet reviews amount and network/setup fees and hybrid-signs the native QOR transfer. The result is a 64-character native Cosmos transaction ID WITHOUT 0x; link to https://explore.qore.network/tx/{hash}. Do not pass it to eth_getTransactionReceipt. On an uncertain transfer, show Check wallet Activity before retrying; never auto-resubmit.
No gas sponsorship, alternate-token fees, arbitrary contract calls, typed-data signing, ERC-20/NFT transfers or WalletConnect compatibility is exposed by this integration.

Deliver a working connect UI, account display, sign-and-verify form, QOR transfer review trigger, result/error states, and disconnect action. Never request recovery phrases or private keys. Test rejection/cancellation, mismatched network, exact request payloads, real signature verification using disposable test keys, and mobile layout. Mock transaction broadcasting in automated tests; do not send funded transactions without authorization.`;
  return <div className="integration-prompt"><div className="prompt-heading"><Sparkles size={18} /><div><strong>Give your coding assistant the right context.</strong><p>Customize, copy, and paste into your AI coding tool. No API key needed.</p></div></div><div className="prompt-fields"><label htmlFor="prompt-app-name">App name<input id="prompt-app-name" value={appName} onChange={e => setAppName(e.target.value)} maxLength={80} /></label><label htmlFor="prompt-framework">Your stack<select id="prompt-framework" value={framework} onChange={e => setFramework(e.target.value)}><option>React + TypeScript</option><option>JavaScript / TypeScript</option></select></label></div><CodeBlock code={prompt} label="AI integration prompt" /></div>;
}

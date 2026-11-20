import { useState } from 'react';
import extensionRelease from '../extension-release.json';
import { Download, Sparkles } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { REPOSITORY, ZENI_RELAY } from './content';

export function IntegrationPrompt() {
  const [appName, setAppName] = useState('My app');
  const [framework, setFramework] = useState('React + TypeScript');
  const [goal, setGoal] = useState('full');
  const [connection, setConnection] = useState('both');
  const signing = goal === 'full' || goal === 'signing';
  const transfers = goal === 'full' || goal === 'transfers';
  const react = framework === 'React + TypeScript';
  const mobile = connection !== 'browser';
  const browser = connection !== 'mobile';
  const prompt = `# Zeni Wallet integration brief

Integrate Zeni Wallet into my existing ${framework} application named ${JSON.stringify(appName.trim() || 'My app')}.
Preserve the app's current design and unrelated functionality.
Scope: wallet connection${signing ? ', message signing and verification' : ''}${transfers ? ', native QOR transfers' : ''}. Implement only these selected features.

## References
Read the actual SDK APIs before writing code:
- Docs: https://zeni-wallet.vercel.app/docs
- React: https://www.npmjs.com/package/@zeni-wallet/react
- JavaScript / TypeScript: https://www.npmjs.com/package/@zeni-wallet/connect
- Protocol: https://www.npmjs.com/package/@zeni-wallet/connect-protocol
- Repository: ${REPOSITORY}
- Guide: ${REPOSITORY}/blob/main/docs/ZENI_CONNECT.md
- Mobile provider: packages/connect; React bindings: packages/react
- Working integration: apps/connect-demo; docs playground: apps/web/src/docs/ConnectPlayground.tsx

## Installation
${react ? 'Install React bindings: npm install @zeni-wallet/react' : mobile ? 'Install the mobile provider: npm install @zeni-wallet/connect' : 'Use the injected browser provider; no React or mobile SDK dependency is required.'}
The protocol dependency is installed automatically by Connect. Use operational versions (0.1.0 or newer), never 0.0.0-stage holding packages. Confirm package exports before importing. Follow the existing app package manager.
${signing || transfers ? 'Install ethers for request encoding' + (signing ? ' and signature verification.' : '.') : ''}
${mobile && !react ? 'Install qrcode for local QR rendering and @types/qrcode for TypeScript.' : ''}
${react ? 'Use React 18 or 19. In Next.js, keep wallet hooks and components behind a client boundary.' : ''}

## Connection
${connection === 'both' ? 'Offer Browser extension and Mobile wallet choices.' : mobile ? 'Offer Mobile wallet connection with QR and same-device deep link.' : 'Offer Browser extension connection only.'}
${browser ? (react ? 'Use useBrowserWallet from @zeni-wallet/react for extension discovery, connection, account/network changes, and local disconnect.' : 'For extension discovery, use EIP-6963 (rdns io.qorechain.zeni) or window.zeni, check isZeni, and call eth_requestAccounts only after a user click.') + ` The extension connects directly without a relay. The current extension beta (v${extensionRelease.version}) only injects on https://zeni-connect-demo.vercel.app and https://zeni-wallet.vercel.app. Other origins require a development extension build explicitly allowing that site; explain this prerequisite before implementation.` : ''}
${mobile ? (react ? 'Use ZeniConnectProvider, useZeni, and ZeniConnectButton (or a custom local QR UI) for mobile.' : 'Use ZeniProvider from @zeni-wallet/connect, listen to display_uri, accountsChanged and disconnect, render the QR locally, and call connect() on user action.') + ` Use relayUrl ${ZENI_RELAY} and my app name; the exact app origin must be allowlisted by the hosted relay operator, or use my own HTTPS relay. Never proxy requests to pretend my app is the demo origin. QR links contain secrets: never log, persist, or send them to remote QR services. The iOS wallet currently requires building from source in Xcode.` : ''}
Clean up providers, polling, and event listeners on unmount.

## Network and requests
Use QoreChain Diana only: chain ID 9800 / 0x2648. Validate the extension network and connected account before signing. Handle cancellation, rejection, expiry, lock/disconnect, account/network changes, pending requests and unsupported methods. Disable duplicate requests.
${signing ? 'Message: personal_sign with params [hexlify(toUtf8Bytes(message)), account]. Accept readable UTF-8 up to 4096 bytes; reject hidden controls. Verify the result with verifyMessage against the requested account. These are classical EIP-191 signatures, not PQC signatures or a complete login system. Authentication requires a server-issued, single-use challenge with domain, nonce, purpose and expiry.' : ''}
${transfers ? 'Transfer: zeni_sendQor with params [{ from: account, to: recipient, value: toQuantity(parseEther(amount)), chainId: \'0x2648\' }]. Validate qor1 or 0x wallet addresses, nonzero amounts and at most six decimal places. Value uses 18-decimal wei units but must be a multiple of 10^12. Do not use eth_sendTransaction. The wallet reviews amount and network/setup fees and hybrid-signs the native QOR transfer. The result is a 64-character native Cosmos transaction ID WITHOUT 0x; link to https://explore.qore.network/tx/{hash}. Do not pass it to eth_getTransactionReceipt. On an uncertain transfer, show Check wallet Activity before retrying; never auto-resubmit.' : ''}
No gas sponsorship, alternate-token fees, arbitrary contract calls, typed-data signing, ERC-20/NFT transfers or WalletConnect compatibility is exposed by this integration.

## Deliverables
Deliver a working connect UI, account display${signing ? ', sign-and-verify form' : ''}${transfers ? ', QOR transfer review trigger' : ''}, result/error states, and disconnect action. Never request recovery phrases or private keys. Test rejection/cancellation, mismatched network, exact request payloads${signing ? ', real signature verification using disposable test keys' : ''}, and mobile layout. Mock transaction broadcasting in automated tests; do not send funded transactions without authorization.`;
  return <div className="integration-prompt">
    <div className="prompt-heading"><Sparkles size={18} aria-hidden="true" /><div><strong>Give your coding assistant the right context.</strong><p>Choose what to build, then copy the prompt or attach the Markdown file to your AI coding tool.</p></div></div>
    <div className="prompt-fields">
      <label htmlFor="prompt-app-name">App name<input id="prompt-app-name" value={appName} onChange={e => setAppName(e.target.value)} maxLength={80} /></label>
      <label htmlFor="prompt-framework">Your stack<select id="prompt-framework" value={framework} onChange={e => setFramework(e.target.value)}><option>React + TypeScript</option><option>JavaScript / TypeScript</option></select></label>
      <label htmlFor="prompt-goal">What to integrate<select id="prompt-goal" value={goal} onChange={e => setGoal(e.target.value)}><option value="full">Connect, sign & transfer</option><option value="connect">Wallet connection only</option><option value="signing">Connection & message signing</option><option value="transfers">Connection & QOR transfers</option></select></label>
      <label htmlFor="prompt-connection">Wallet connection<select id="prompt-connection" value={connection} onChange={e => setConnection(e.target.value)}><option value="both">Mobile & browser extension</option><option value="mobile">Mobile wallet</option><option value="browser">Browser extension</option></select></label>
    </div>
    <div className="prompt-actions"><a className="docs-button" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(prompt + '\n')}`} download={`zeni-${goal}-${connection}-integration.md`}><Download size={16} aria-hidden="true" />Download .md</a><span className="docs-small">Includes package links, API guidance, and checks for your selection.</span></div>
    <CodeBlock code={prompt} label="AI integration prompt" copyLabel="Copy prompt" />
  </div>;
}

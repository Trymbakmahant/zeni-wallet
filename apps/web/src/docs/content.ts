export const ZENI_RELAY = 'https://zeni-wallet.onrender.com';
export const CONNECT_DEMO = 'https://zeni-connect-demo.vercel.app';
export const REPOSITORY = 'https://github.com/Trymbakmahant/zeni-wallet';
export const sections = [
  { id: 'overview', title: 'Overview', group: 'Start here', description: 'Zeni Connect, wallet, encrypted relay, QR connection, Diana testnet' },
  { id: 'sdk', title: 'What the SDK does', group: 'Start here', description: 'SDK packages, user onboarding, authentication, connect, sign messages, broadcast native QOR transactions, capabilities' },
  { id: 'playground', title: 'Live playground', group: 'Start here', description: 'Embedded demo, connect extension, mobile QR, sign message, transfer, live request code' },
  { id: 'ai-prompt', title: 'AI integration prompt', group: 'Build with Zeni', description: 'Copy prompt, AI assistant, integrate wallet, React, JavaScript, TypeScript, coding agent' },
  { id: 'quickstart', title: 'Quickstart', group: 'Start here', description: 'Installation, source, packages, tarballs, npm, pnpm, local development' },
  { id: 'react', title: 'React integration', group: 'Build with Zeni', description: 'ZeniConnectProvider, useZeni, ZeniConnectButton, hook, QR code' },
  { id: 'browser', title: 'Browser extension', group: 'Build with Zeni', description: 'useBrowserWallet, EIP-6963, window.zeni, extension discovery, approved websites, no relay' },
  { id: 'javascript', title: 'JavaScript / TypeScript', group: 'Build with Zeni', description: 'ZeniProvider, connect, display_uri, request, disconnect, provider events' },
  { id: 'requests', title: 'Signing & transactions', group: 'Build with Zeni', description: 'personal_sign, zeni_sendQor, QOR, EIP-191, message, signature, broadcast, transaction ID, fees' },
  { id: 'mobile', title: 'Mobile wallet', group: 'Build with Zeni', description: 'iOS, Xcode, QR scanner, deep link, Face ID, device, phone' },
  { id: 'relay', title: 'Host a relay', group: 'Reference', description: 'Docker, Caddy, HTTPS, domain, ALLOWED_ORIGINS, server, deployment' },
  { id: 'api', title: 'API reference', group: 'Reference', description: 'methods, events, errors, 4001, 4100, 4200, 4900, -32002, account, chain' },
  { id: 'sessions', title: 'Sessions & security', group: 'Reference', description: 'expiry, limits, encryption, AES-GCM, keys, metadata, privacy, replay, WalletConnect' },
  { id: 'troubleshooting', title: 'Troubleshooting', group: 'Reference', description: 'connection failed, expired QR, localhost, transaction pending, invalid Origin' },
];
export const reactExample = `import {
  ZeniConnectProvider,
  ZeniConnectButton,
  useZeni,
} from '@zeni-wallet/react';

export default function App() {
  return (
    <ZeniConnectProvider
      relayUrl="${ZENI_RELAY}"
      name="Your app"
    >
      <ZeniConnectButton />
      <Account />
    </ZeniConnectProvider>
  );
}

function Account() {
  const { account, connecting, error } = useZeni();
  if (error) return <p role="alert">{error}</p>;
  return <p>{connecting ? 'Connecting…' : account}</p>;
}`;
export const browserExample = `import { useBrowserWallet } from '@zeni-wallet/react';

// Render on the client, on a site allowed by the extension.
export function ConnectZeni() {
  const wallet = useBrowserWallet();

  return (
    <div>
      {wallet.account ? (
        <>
          <p>Connected: {wallet.account}</p>
          <button onClick={wallet.disconnect}>Disconnect</button>
        </>
      ) : (
        <button
          disabled={wallet.connecting}
          onClick={() => void wallet.connect()}
        >
          {wallet.connecting ? 'Check Zeni…' : 'Connect Zeni'}
        </button>
      )}
      {!wallet.detected && (
        <p>Install Zeni and reload an allowed website to connect.</p>
      )}
      {wallet.error && <p role="alert">{wallet.error}</p>}
    </div>
  );
}

// Once connected, wallet.provider.request(...) sends requests
// for the user to approve. See Signing & transactions below.`;
export const jsExample = `import { ZeniProvider } from '@zeni-wallet/connect';
import QRCode from 'qrcode';

const wallet = new ZeniProvider({
  relayUrl: '${ZENI_RELAY}',
  name: 'Your app',
});

// Your page provides <canvas id="zeni-qr"></canvas>.
const canvas = document.getElementById('zeni-qr');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Add the Zeni QR canvas to your page.');
}
wallet.on('display_uri', (uri) => {
  QRCode.toCanvas(canvas, uri);
});
wallet.on('accountsChanged', (accounts) => {
  console.log('Connected accounts:', accounts);
});
wallet.on('disconnect', () => {
  console.log('Wallet disconnected');
});

// Resolves after the user approves on their phone.
const [account] = await wallet.connect();

// When the user chooses to disconnect:
// await wallet.disconnect();`;
export const signExample = `// Inside a component wrapped by ZeniConnectProvider:
const { provider, account } = useZeni();

async function signMessage() {
  if (!account) return;
  try {
    const signature = await provider.request({
      method: 'personal_sign',
      params: ['0x68656c6c6f', account], // UTF-8 "hello"
    });
    // Verify against your server-issued challenge.
    return signature;
  } catch (error) {
    console.error('Signature request failed:', error);
  }
}`;
export const transferExample = `// Run from a user action after connecting.
// provider: mobile or extension provider; account: approved address.
// Disable repeat submissions while this request is pending.
const hash = await provider.request({
  method: 'zeni_sendQor',
  params: [{
    from: account,
    to: '0xRECIPIENT_ADDRESS', // Replace with a real address.
    value: '0x38d7ea4c68000', // 0.001 QOR, in wei.
    chainId: '0x2648',       // QoreChain Diana: 9800.
  }],
});

// Native Cosmos transaction ID: 64 hex characters, without 0x.
console.log('Native transfer confirmed:', hash);`;
export const buildExample = `git clone https://github.com/Trymbakmahant/zeni-wallet.git
cd zeni-wallet
pnpm install
pnpm build:connect`;
export const packageExample = `pnpm --dir packages/connect-protocol pack --pack-destination ../../artifacts/connect-sdk
pnpm --dir packages/connect pack --pack-destination ../../artifacts/connect-sdk
pnpm --dir packages/react pack --pack-destination ../../artifacts/connect-sdk`;
export const installExample = `# React 18 / 19:
npm install @zeni-wallet/react

# JavaScript / TypeScript (without React):
npm install @zeni-wallet/connect

# If your code imports these directly:
npm install ethers qrcode
# TypeScript projects using qrcode:
npm install --save-dev @types/qrcode`;
export const relayExample = `cd apps/relay
export RELAY_DOMAIN=relay.your-domain.com
export ALLOWED_ORIGINS=https://your-app.com

docker compose up --build -d`;
export const localExample = `# Terminal 1, from the repository root:
pnpm dev:relay

# Terminal 2:
pnpm dev:connect

# Demo:  http://localhost:5174
# Relay: http://localhost:8787`;

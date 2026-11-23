import '@rainbow-me/rainbowkit/styles.css';
import type { ReactNode } from 'react';
import { ConnectButton, RainbowKitProvider, connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { qorexWallet } from '@qorechain/qorex-rainbowkit';
import { qorechainTestnet } from '@qorechain/evm';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';

const { id, name, nativeCurrency, rpcUrls, blockExplorers } = qorechainTestnet;
const config = createConfig({
  chains: [{ id, name, nativeCurrency, rpcUrls, blockExplorers, testnet: true }],
  connectors: connectorsForWallets([{
    groupName: 'Recommended',
    wallets: [() => qorexWallet({ pollAccountsOnFocus: true }), injectedWallet],
  }], { appName: 'Zeni Docs Playground', projectId: 'unused' }),
  transports: { [qorechainTestnet.id]: http() },
});
const client = new QueryClient();

export default function WalletPicker({ children }: { children?: ReactNode }) {
  return <WagmiProvider config={config} reconnectOnMount={false}>
    <QueryClientProvider client={client}>
      <RainbowKitProvider initialChain={id} modalSize="wide">
        {children ?? <ConnectButton showBalance={false} />}
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>;
}

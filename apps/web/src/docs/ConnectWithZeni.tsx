import { useAccount, useConnect, useDisconnect } from 'wagmi';

// Render under a WagmiProvider configured for Diana with EIP-6963 discovery.
export default function ConnectWithZeni() {
  const { connectors, connect, isPending, error } = useConnect();
  const { address, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const zeni = connectors.find(c => c.id === 'io.qorechain.zeni');

  if (address && zeni && connector?.uid === zeni.uid) {
    return <div className="pg-account"><code>{address}</code>
      <button type="button" onClick={() => disconnect()}>Disconnect Zeni</button>
    </div>;
  }
  return <div className="pg-wagmi">
    <button type="button" className="docs-button docs-button-primary" disabled={!zeni || isPending}
      onClick={() => zeni && connect({ connector: zeni, chainId: 9800 })}>
      {isPending ? 'Waiting for wallet...' : 'Connect with Zeni'}
    </button>
    {!zeni && <p className="pg-helper">Enable the Zeni extension and refresh.</p>}
    {error && <p role="alert">Connection not approved. Try again.</p>}
  </div>;
}

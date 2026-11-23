import type { Eip1193Provider } from 'ethers';

// Select Zeni even when QoreX or another injected wallet is installed.
export function findZeni(): Eip1193Provider | undefined {
  let provider: Eip1193Provider | undefined;
  const announce = (event: Event) => {
    const { info, provider: wallet } = (event as CustomEvent).detail ?? {};
    if (info?.rdns === 'io.qorechain.zeni' && typeof wallet?.request === 'function') {
      provider = wallet;
    }
  };
  window.addEventListener('eip6963:announceProvider', announce);
  try {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  } finally {
    window.removeEventListener('eip6963:announceProvider', announce);
  }
  return provider;
}

// Call from a button click; discovery alone never requests an account.
export async function connectExtension(provider = findZeni()) {
  if (!provider) throw new Error('Zeni extension not detected. Install it and reload this page.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const account = accounts?.[0];
  if (!Array.isArray(accounts) || typeof account !== 'string' || !/^0x[0-9a-f]{40}$/i.test(account)) {
    throw new Error('No valid account was approved. Unlock Zeni and try again.');
  }
  const chain = await provider.request({ method: 'eth_chainId' });
  if (BigInt(chain) !== 9800n) throw new Error('Use QoreChain Diana testnet (chain 9800) in Zeni.');
  return { account, provider };
}

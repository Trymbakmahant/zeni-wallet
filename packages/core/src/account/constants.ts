export const QORECHAIN_CONFIG = {
  chainId: 9800,
  chainName: "QoreChain Testnet",
  cosmosChainId: "qorechain-diana",
  restUrl: "https://api-testnet.qore.host",
  nativeCurrency: {
    name: "QOR",
    symbol: "QOR",
    decimals: 18,
  },
  rpcUrls: [
    "https://evm-testnet.qore.host",
  ],
  blockExplorerUrls: [
    "https://explore.qore.network",
  ],
  contracts: {
    pqcPrecompile: "0x0000000000000000000000000000000000000a01",
    entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    // Testnet tokens
    fUSD: "0x97143B771D34ddb9130b807b135Ae675A5a963CA",
    fETH: "0x02292293c13880a26242690eb70a0e42B8E91c28",
    fBTC: "0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A",
  },
} as const;

// Native AMM amounts use bank denominations, including QOR's SIX decimal uqor.
// The ERC-20 denomination addresses are case-sensitive.
export const AMM_ASSETS = {
  QOR: { denom: "uqor", decimals: 6 },
  fUSD: { denom: `erc20:${QORECHAIN_CONFIG.contracts.fUSD}`, decimals: 6 },
  fETH: { denom: `erc20:${QORECHAIN_CONFIG.contracts.fETH}`, decimals: 18 },
  fBTC: { denom: `erc20:${QORECHAIN_CONFIG.contracts.fBTC}`, decimals: 8 },
} as const;
export type AmmAsset = keyof typeof AMM_ASSETS;

export function transactionExplorerUrl(hash: string): string {
  if (!/^(0x)?[a-fA-F0-9]{64}$/.test(hash)) throw new Error("Invalid transaction hash.");
  return `${QORECHAIN_CONFIG.blockExplorerUrls[0]}/tx/${hash}`;
}

export const DILITHIUM5_PUBKEY_BYTES = 2592;
export const DILITHIUM5_SIG_BYTES = 4627;
export const SECP256K1_SIG_BYTES = 65;

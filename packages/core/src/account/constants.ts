export const QORECHAIN_CONFIG = {
  chainId: 9800,
  chainName: "QoreChain Testnet",
  nativeCurrency: {
    name: "QOR",
    symbol: "QOR",
    decimals: 18,
  },
  rpcUrls: [
    "https://evm-testnet.qore.host",
  ],
  blockExplorerUrls: [
    "https://dashboard.qorechain.io/explorer",
  ],
  contracts: {
    pqcPrecompile: "0x0000000000000000000000000000000000000a01",
    entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    // Testnet tokens
    fUSD: "0x385501b6191c49d8c0f99Ec05342F851D61b9a1A",
    fETH: "0x981571F3089D38102e1C31a4FAE6329FE539B417",
    fBTC: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  },
} as const;

export const DILITHIUM5_PUBKEY_BYTES = 2592;
export const DILITHIUM5_SIG_BYTES = 4627;
export const SECP256K1_SIG_BYTES = 65;

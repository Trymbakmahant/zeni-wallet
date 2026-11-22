// Zeni's own app suite. Every entry is built or operated by the Zeni team —
// no third-party projects are listed here.

export type ToolId = "stamp" | "connections";

export interface ZeniTool {
  id: ToolId;
  name: string;
  tagline: string;
  accent: string;
  icon: "stamp" | "connections";
}

export interface ZeniWebApp {
  id: string;
  name: string;
  tagline: string;
  url: string;
  accent: string;
}

export interface ZeniRoadmap {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  icon: "sessions" | "escrow" | "seal" | "names";
}

// Mini-apps that run inside the extension itself.
export const ZENI_TOOLS: ZeniTool[] = [
  {
    id: "stamp",
    name: "Zeni Stamp",
    tagline: "Notarize and verify messages — hybrid secp256k1 + ML-DSA-87.",
    accent: "#E06341",
    icon: "stamp",
  },
  {
    id: "connections",
    name: "Connections",
    tagline: "See which sites hold a wallet connection. Revoke in one tap.",
    accent: "#38BDF8",
    icon: "connections",
  },
];

// Zeni-operated web apps (open in a new tab).
export const ZENI_WEB_APPS: ZeniWebApp[] = [
  {
    id: "vault-lab",
    name: "Zeni Vault Lab",
    tagline: "Deploy or pick a demo vault, then deposit and withdraw testnet QOR.",
    url: "https://zeni-wallet.vercel.app/vault",
    accent: "#FBBF24",
  },
  {
    id: "zeni-docs",
    name: "Zeni Docs",
    tagline: "Integrate your app with the Zeni browser and mobile SDKs.",
    url: "https://zeni-wallet.vercel.app/docs",
    accent: "#A78BFA",
  },
];

// QoreChain network utilities operated by the chain team.
export const NETWORK_LINKS: ZeniWebApp[] = [
  {
    id: "diana-faucet",
    name: "Diana Faucet",
    tagline: "Claim testnet QOR and faucet tokens.",
    url: "https://dashboard.qorechain.io/faucet",
    accent: "#34D399",
  },
  {
    id: "explorer",
    name: "QoreChain Explorer",
    tagline: "Look up transactions and accounts on Diana testnet.",
    url: "https://explore.qore.network",
    accent: "#94A3B8",
  },
];

// Upcoming Zeni mini-apps — our own takes on the ecosystem's biggest themes.
export const ZENI_ROADMAP: ZeniRoadmap[] = [
  {
    id: "sessions",
    name: "Zeni Sessions",
    tagline: "Scoped spend mandates for AI agents — budget, allowlist, expiry.",
    accent: "#E06341",
    icon: "sessions",
  },
  {
    id: "escrow",
    name: "Timelock Send",
    tagline: "Send QOR that only unlocks after a time or condition you set.",
    accent: "#FBBF24",
    icon: "escrow",
  },
  {
    id: "seal",
    name: "Zeni Seal",
    tagline: "Post-quantum encrypted messages to any QoreChain address.",
    accent: "#A78BFA",
    icon: "seal",
  },
  {
    id: "names",
    name: "Zeni Names",
    tagline: "Resolve .qore names right inside the send flow.",
    accent: "#38BDF8",
    icon: "names",
  },
];

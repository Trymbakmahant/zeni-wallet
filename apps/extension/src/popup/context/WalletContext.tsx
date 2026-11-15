import React, { createContext, useContext, useState, useEffect } from "react";
import { QORECHAIN_CONFIG, isValidMnemonic, generateNewMnemonic } from "@zeni/core";

export interface TokenItem {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  icon: string;
}

export interface ActivityItem {
  hash: string;
  type: "SEND" | "SWAP";
  to?: string;
  token?: string;
  tokenIn?: string;
  tokenOut?: string;
  amount?: string;
  amountIn?: string;
  amountOut?: string;
  timestamp: number;
  status: "CONFIRMED" | "PENDING" | "FAILED";
  gasCost: string;
}

export interface PendingApproval {
  internalId: string;
  origin: string;
  title?: string;
  favIconUrl?: string;
  payload: { method: string; params?: any[] };
  createdAt: number;
}

interface WalletContextType {
  isInitialized: boolean;
  isLocked: boolean;
  activeAddress: string | null;
  cosmosAddress: string | null;
  pqcPublicKeyHash: string | null;
  tokens: TokenItem[];
  activity: ActivityItem[];
  pendingApprovals: PendingApproval[];
  activeModal: "send" | "receive" | "swap" | null;
  openModal: (modal: "send" | "receive" | "swap" | null) => void;
  createWallet: (password: string, customMnemonic?: string) => Promise<{ mnemonic: string }>;
  unlock: (password: string) => Promise<void>;
  lock: () => Promise<void>;
  sendTokens: (to: string, amount: string, token: string) => Promise<string>;
  executeSwap: (tokenIn: string, tokenOut: string, amountIn: string, amountOut: string) => Promise<string>;
  resolveApproval: (internalId: string, approved: boolean) => Promise<void>;
  exportMnemonic: (password: string) => Promise<string>;
  refreshState: () => Promise<void>;
  resetWallet: () => Promise<void>;
  clearActivity: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [cosmosAddress, setCosmosAddress] = useState<string | null>(null);
  const [pqcPublicKeyHash, setPqcPublicKeyHash] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<"send" | "receive" | "swap" | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const [tokens, setTokens] = useState<TokenItem[]>([
    { symbol: "QOR", name: "QoreChain Native", balance: "0.0000", usdValue: "$0.00", icon: "💎" },
    { symbol: "fUSD", name: "Faucet USD", balance: "0.00", usdValue: "$0.00", icon: "💵" },
    { symbol: "fETH", name: "Faucet Ethereum", balance: "0.0000", usdValue: "$0.00", icon: "Ξ" },
    { symbol: "fBTC", name: "Faucet Bitcoin", balance: "0.0000", usdValue: "$0.00", icon: "₿" },
  ]);

  const sendMessage = (type: string, payload: Record<string, any> = {}): Promise<any> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || "Background worker error"));
        }
      });
    });
  };

  const refreshState = async () => {
    try {
      const status = await sendMessage("GET_STATUS");
      setIsInitialized(status.isInitialized);
      setIsLocked(!status.isUnlocked);
      setActiveAddress(status.activeAddress);
      setCosmosAddress(status.cosmosAddress);
      setPqcPublicKeyHash(status.pqcPublicKeyHash);

      const rawNum = parseFloat(status.onChainBalance || "0") || 0;
      const qorFormatted = rawNum.toFixed(4);
      const qorUsd = (rawNum * 2.0).toLocaleString("en-US", { style: "currency", currency: "USD" });

      const tb = status.tokenBalances || {};
      const fusdBal = parseFloat(tb.fUSD || "0");
      const fethBal = parseFloat(tb.fETH || "0");
      const fbtcBal = parseFloat(tb.fBTC || "0");

      setTokens([
        {
          symbol: "QOR",
          name: "QoreChain Native",
          balance: qorFormatted,
          usdValue: qorUsd,
          icon: "💎",
        },
        {
          symbol: "fUSD",
          name: "Faucet USD",
          balance: fusdBal.toFixed(2),
          usdValue: (fusdBal * 1.0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
          icon: "💵",
        },
        {
          symbol: "fETH",
          name: "Faucet Ethereum",
          balance: fethBal.toFixed(4),
          usdValue: (fethBal * 3100.0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
          icon: "Ξ",
        },
        {
          symbol: "fBTC",
          name: "Faucet Bitcoin",
          balance: fbtcBal.toFixed(4),
          usdValue: (fbtcBal * 65000.0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
          icon: "₿",
        },
      ]);

      const approvals = await sendMessage("GET_PENDING_APPROVALS");
      setPendingApprovals(approvals || []);

      const act = await sendMessage("GET_ACTIVITY");
      setActivity(act || []);
    } catch (e) {
      console.error("Failed to refresh wallet state", e);
    }
  };

  useEffect(() => {
    refreshState();
    // Poll pending approvals periodically
    const interval = setInterval(() => {
      sendMessage("GET_PENDING_APPROVALS")
        .then((res) => setPendingApprovals(res || []))
        .catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const createWallet = async (password: string, customMnemonic?: string): Promise<{ mnemonic: string }> => {
    const mnemonic = customMnemonic ? customMnemonic.trim() : generateNewMnemonic(128);
    if (!isValidMnemonic(mnemonic)) {
      throw new Error("Invalid 12- or 24-word recovery phrase");
    }

    await sendMessage("CREATE_VAULT", { mnemonic, password });
    await refreshState();
    return { mnemonic };
  };

  const unlock = async (password: string) => {
    await sendMessage("UNLOCK_VAULT", { password });
    await refreshState();
  };

  const lock = async () => {
    await sendMessage("LOCK_VAULT");
    await refreshState();
  };

  const sendTokens = async (to: string, amount: string, token: string): Promise<string> => {
    const res = await sendMessage("EXECUTE_TRANSFER", { to, amount, token });
    // Update local balances optimistically
    setTokens((prev) =>
      prev.map((t) => {
        if (t.symbol === token) {
          const newBal = Math.max(0, parseFloat(t.balance) - parseFloat(amount)).toFixed(2);
          return { ...t, balance: newBal };
        }
        return t;
      })
    );
    await refreshState();
    return res.txHash;
  };

  const executeSwap = async (
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOut: string
  ): Promise<string> => {
    const res = await sendMessage("EXECUTE_SWAP", { tokenIn, tokenOut, amountIn, amountOut });
    setTokens((prev) =>
      prev.map((t) => {
        if (t.symbol === tokenIn) {
          return { ...t, balance: Math.max(0, parseFloat(t.balance) - parseFloat(amountIn)).toFixed(2) };
        }
        if (t.symbol === tokenOut) {
          return { ...t, balance: (parseFloat(t.balance) + parseFloat(amountOut)).toFixed(2) };
        }
        return t;
      })
    );
    await refreshState();
    return res.txHash;
  };

  const resolveApproval = async (internalId: string, approved: boolean) => {
    await sendMessage("RESOLVE_APPROVAL", { internalId, approved });
    await refreshState();
  };

  const exportMnemonic = async (password: string): Promise<string> => {
    return sendMessage("EXPORT_MNEMONIC", { password });
  };

  const resetWallet = async () => {
    await sendMessage("RESET_WALLET");
    await refreshState();
  };

  const clearActivity = async () => {
    await sendMessage("CLEAR_ACTIVITY");
    setActivity([]);
  };

  return (
    <WalletContext.Provider
      value={{
        isInitialized,
        isLocked,
        activeAddress,
        cosmosAddress,
        pqcPublicKeyHash,
        tokens,
        activity,
        pendingApprovals,
        activeModal,
        openModal: setActiveModal,
        createWallet,
        unlock,
        lock,
        sendTokens,
        executeSwap,
        resolveApproval,
        exportMnemonic,
        refreshState,
        resetWallet,
        clearActivity,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
};

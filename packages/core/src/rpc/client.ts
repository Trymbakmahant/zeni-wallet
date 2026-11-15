import { ethers } from "ethers";
import { UserOperationData } from "../account/userop.js";

export interface SponsorOpResponse {
  paymasterAndData: string;
  preVerificationGas: string;
  verificationGasLimit: string;
  callGasLimit: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface UserOpReceipt {
  userOpHash: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  success: boolean;
  actualGasCost: string;
  actualGasUsed: string;
  reason?: string;
}

export class QoreChainClient {
  public provider: ethers.JsonRpcProvider;
  public rpcUrl: string;

  constructor(rpcUrl = "https://evm-testnet.qore.host") {
    this.rpcUrl = rpcUrl;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Fetches native QOR balance
   */
  async getNativeBalance(address: string): Promise<bigint> {
    return this.provider.getBalance(address);
  }

  /**
   * Fetches ERC-20 token balance, defaulting to 0n if contract is undeployed or reverts
   */
  async getTokenBalance(tokenAddress: string, accountAddress: string): Promise<bigint> {
    try {
      const code = await this.provider.getCode(tokenAddress);
      if (!code || code === "0x") {
        return 0n;
      }
      const contract = new ethers.Contract(
        tokenAddress,
        ["function balanceOf(address) view returns (uint256)"],
        this.provider
      );
      return await contract.balanceOf(accountAddress);
    } catch {
      return 0n;
    }
  }

  /**
   * Submits a signed UserOperation to the ERC-4337 bundler
   */
  async sendUserOperation(
    userOp: UserOperationData,
    entryPointAddress: string
  ): Promise<string> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "eth_sendUserOperation",
        params: [userOp, entryPointAddress],
      }),
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(`Bundler error: ${json.error.message || JSON.stringify(json.error)}`);
    }
    return json.result; // Returns userOpHash
  }

  /**
   * Polls for the UserOperation receipt until mined or timed out
   */
  async pollUserOperationReceipt(
    userOpHash: string,
    timeoutMs = 60000,
    pollIntervalMs = 2000
  ): Promise<UserOpReceipt> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "eth_getUserOperationReceipt",
          params: [userOpHash],
        }),
      });

      const json = await response.json();
      if (json.result) {
        return json.result as UserOpReceipt;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Timed out waiting for UserOperation receipt: ${userOpHash}`);
  }

  /**
   * Requests gas sponsorship from Paymaster RPC
   */
  async requestPaymasterSponsorship(
    userOp: UserOperationData,
    entryPointAddress: string
  ): Promise<SponsorOpResponse> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "pm_sponsorUserOperation",
        params: [userOp, entryPointAddress],
      }),
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(`Paymaster sponsorship failed: ${json.error.message || JSON.stringify(json.error)}`);
    }
    return json.result;
  }
}

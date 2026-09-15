export type Address = `0x${string}`;

export type Stream = {
  id: string;
  receiver: Address;
  label: string;
  monthlyAmount: number;
  protected: boolean;
  status: "active" | "paused";
};

export type TreasurySnapshot = {
  capturedAt: string;
  source: "demo" | "rpc" | "keeperhub";
  chainId: number;
  chainName: string;
  safeAddress: Address;
  safe: { owners: number; threshold: number; nonce: number };
  liquidBaseToken: number;
  superTokenBalance: number;
  monthlyInflows: number;
  otherMonthlyCosts: number;
  streams: Stream[];
};

export type TreasuryPolicy = {
  version: string;
  minimumRunwayDays: number;
  targetRunwayDays: number;
  maximumSingleActionUsd: number;
  maximumStreamReductionPercent: number;
  protectedReceivers: Address[];
  allowedChainIds: number[];
  allowedContracts: Address[];
  requireSimulation: boolean;
  requireHumanApproval: boolean;
};

export type PolicyCheck = {
  code: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type KeeperHubContractCall = {
  path: "/execute/contract-call";
  body: {
    chainId: number;
    contractAddress: Address;
    functionName: string;
    functionArgs: string;
    abi: string;
  };
};

export type KeeperHubTransferCall = {
  path: "/execute/transfer";
  body: {
    chainId: number;
    recipientAddress: Address;
    tokenAddress: Address;
    amount: string;
  };
};

export type KeeperHubCall =
  | KeeperHubContractCall
  | KeeperHubTransferCall;

export type RecoveryAction = {
  id: string;
  kind: "top-up" | "wrap" | "update-flow" | "delete-flow";
  title: string;
  description: string;
  amountUsd: number;
  receiver?: Address;
  previousMonthlyAmount?: number;
  nextMonthlyAmount?: number;
  keeperhub: KeeperHubCall;
};

export type RecoveryManifest = {
  schema: "runlock.recovery.v1";
  planId: string;
  createdAt: string;
  expiresAt: string;
  chainId: number;
  safeAddress: Address;
  snapshotDigest: string;
  policyVersion: string;
  currentRunwayDays: number;
  projectedRunwayDays: number;
  actions: RecoveryAction[];
  checks: PolicyCheck[];
  manifestHash: string;
};

export type ExecutionReceipt = {
  mode: "demo" | "live";
  manifestHash: string;
  status: "simulated" | "completed" | "unconfirmed" | "failed";
  startedAt: string;
  completedAt: string;
  results: Array<{
    actionId: string;
    status: string;
    executionId?: string;
    transactionHash?: string;
    transactionLink?: string;
    gasEstimate?: string;
    wouldRevert?: boolean;
    from?: string;
    to?: string;
    verified?: boolean;
    receiptStatus?: string;
    blockNumber?: string | number;
    error?: string;
  }>;
};

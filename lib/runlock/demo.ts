import type { Address, TreasuryPolicy, TreasurySnapshot } from "./types.ts";

export const DEMO_ADDRESSES = {
  safe: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" as Address,
  superToken: "0x30a6933Ca9230361972E413a15dC8114c952414e" as Address,
  cfaForwarder: "0xcfA132E353cB4E398080B9700609bb008eceB125" as Address,
  coreEngineer: "0x1111111111111111111111111111111111111111" as Address,
  operations: "0x2222222222222222222222222222222222222222" as Address,
  community: "0x3333333333333333333333333333333333333333" as Address,
  tooling: "0x4444444444444444444444444444444444444444" as Address,
};

export const demoSnapshot: TreasurySnapshot = {
  capturedAt: "2026-09-11T09:30:00.000Z",
  source: "demo",
  chainId: 11155111,
  chainName: "Sepolia",
  safeAddress: DEMO_ADDRESSES.safe,
  safe: { owners: 3, threshold: 2, nonce: 47 },
  liquidBaseToken: 392,
  superTokenBalance: 138,
  monthlyInflows: 100,
  otherMonthlyCosts: 100,
  streams: [
    { id: "stream-core", receiver: DEMO_ADDRESSES.coreEngineer, label: "Core engineering", monthlyAmount: 340, protected: true, status: "active" },
    { id: "stream-ops", receiver: DEMO_ADDRESSES.operations, label: "Operations", monthlyAmount: 180, protected: true, status: "active" },
    { id: "stream-community", receiver: DEMO_ADDRESSES.community, label: "Community rewards", monthlyAmount: 210, protected: false, status: "active" },
    { id: "stream-tooling", receiver: DEMO_ADDRESSES.tooling, label: "Experimental tooling", monthlyAmount: 90, protected: false, status: "active" },
  ],
};

export const defaultPolicy: TreasuryPolicy = {
  version: "policy-2026-09-11.1",
  minimumRunwayDays: 21,
  targetRunwayDays: 30,
  maximumSingleActionUsd: 100,
  maximumStreamReductionPercent: 100,
  protectedReceivers: [DEMO_ADDRESSES.coreEngineer, DEMO_ADDRESSES.operations],
  allowedChainIds: [11155111],
  allowedContracts: [DEMO_ADDRESSES.superToken, DEMO_ADDRESSES.cfaForwarder],
  requireSimulation: true,
  requireHumanApproval: true,
};

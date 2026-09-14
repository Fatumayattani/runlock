import { digest } from "./canonical.ts";
import { DEMO_ADDRESSES } from "./demo.ts";
import { monthlyToFlowRate, netMonthlyBurn, runwayDays, totalBalance } from "./math.ts";
import type { PolicyCheck, RecoveryAction, RecoveryManifest, TreasuryPolicy, TreasurySnapshot } from "./types.ts";

const superTokenAbi = JSON.stringify([{ inputs: [{ name: "amount", type: "uint256" }], name: "upgrade", outputs: [], stateMutability: "nonpayable", type: "function" }]);
const forwarderAbi = JSON.stringify([
  { inputs: [{ name: "token", type: "address" }, { name: "receiver", type: "address" }, { name: "flowrate", type: "int96" }, { name: "userData", type: "bytes" }], name: "updateFlow", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "token", type: "address" }, { name: "sender", type: "address" }, { name: "receiver", type: "address" }, { name: "userData", type: "bytes" }], name: "deleteFlow", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
]);

function addresses() {
  return {
    baseToken: (process.env.RUNLOCK_BASE_TOKEN_ADDRESS ?? DEMO_ADDRESSES.superToken) as `0x${string}`,
    superToken: (process.env.RUNLOCK_SUPER_TOKEN_ADDRESS ?? DEMO_ADDRESSES.superToken) as `0x${string}`,
    forwarder: (process.env.RUNLOCK_CFA_FORWARDER_ADDRESS ?? DEMO_ADDRESSES.cfaForwarder) as `0x${string}`,
  };
}

export function evaluatePolicy(snapshot: TreasurySnapshot, policy: TreasuryPolicy, actions: RecoveryAction[]): PolicyCheck[] {
  const protectedTouched = actions.some((action) => action.receiver && policy.protectedReceivers.map((value) => value.toLowerCase()).includes(action.receiver.toLowerCase()));
  const actionContract = (action: RecoveryAction) =>
    action.keeperhub.path === "/execute/transfer"
      ? action.keeperhub.body.tokenAddress
      : action.keeperhub.body.contractAddress;
  return [
    { code: "chain-allowlisted", label: "Approved network", passed: policy.allowedChainIds.includes(snapshot.chainId), detail: `${snapshot.chainName} · ${snapshot.chainId}` },
    { code: "contracts-allowlisted", label: "Contracts allowlisted", passed: actions.every((action) => policy.allowedContracts.map((value) => value.toLowerCase()).includes(actionContract(action).toLowerCase())), detail: "Treasury token and Superfluid contracts only" },
    { code: "protected-recipients", label: "Protected streams untouched", passed: !protectedTouched, detail: "Core engineering and operations preserved" },
    { code: "action-limit", label: "Action value within limit", passed: actions.every((action) => action.amountUsd <= policy.maximumSingleActionUsd), detail: `Maximum ${policy.maximumSingleActionUsd} stablecoin per action` },
    { code: "simulation-required", label: "Simulation required", passed: policy.requireSimulation, detail: "Execution remains locked until preflight succeeds" },
    { code: "human-approval", label: "Human approval required", passed: policy.requireHumanApproval, detail: "The agent cannot approve its own plan" },
  ];
}

export function policyForSnapshot(
  snapshot: TreasurySnapshot,
  basePolicy: TreasuryPolicy,
): TreasuryPolicy {
  if (snapshot.source === "demo") return basePolicy;

  const { baseToken, superToken, forwarder } = addresses();

  return {
    ...basePolicy,
    version: `${basePolicy.version}.live`,
    protectedReceivers: snapshot.streams
      .filter((stream) => stream.protected)
      .map((stream) => stream.receiver),
    allowedContracts: [baseToken, superToken, forwarder],
  };
}

function createLiveTopUp(
  snapshot: TreasurySnapshot,
  policy: TreasuryPolicy,
): { actions: RecoveryAction[]; projected: number } {
  const burn = netMonthlyBurn(snapshot);
  const currentBalance = totalBalance(snapshot);

  if (burn === 0 || runwayDays(snapshot) >= policy.minimumRunwayDays) {
    return { actions: [], projected: runwayDays(snapshot) };
  }

  const targetBalance =
    burn * (policy.targetRunwayDays / 30);
  const required = Math.max(0, targetBalance - currentBalance);
  const amount = Math.min(
    policy.maximumSingleActionUsd,
    Math.ceil(required * 100) / 100,
  );

  if (amount <= 0) {
    return { actions: [], projected: runwayDays(snapshot) };
  }

  const { baseToken } = addresses();
  const actions: RecoveryAction[] = [
    {
      id: "reserve-top-up",
      kind: "top-up",
      title: "Restore treasury runway",
      description: `Transfer ${amount} reserve tokens into the Safe treasury.`,
      amountUsd: amount,
      receiver: snapshot.safeAddress,
      keeperhub: {
        path: "/execute/transfer",
        body: {
          chainId: snapshot.chainId,
          recipientAddress: snapshot.safeAddress,
          tokenAddress: baseToken,
          amount: String(amount),
        },
      },
    },
  ];

  return {
    actions,
    projected:
      ((currentBalance + amount) / burn) * 30,
  };
}

export function createRecoveryPlan(snapshot: TreasurySnapshot, policy: TreasuryPolicy, now = new Date()): RecoveryManifest {
  const current = runwayDays(snapshot);
  if (snapshot.source !== "demo") {
    const { actions, projected } = createLiveTopUp(snapshot, policy);
    const checks = evaluatePolicy(snapshot, policy, actions);
    const createdAt = now.toISOString();
    const unsigned = {
      schema: "runlock.recovery.v1" as const,
      planId: `run-${digest({ snapshot, createdAt }).slice(0, 12)}`,
      createdAt,
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      chainId: snapshot.chainId,
      safeAddress: snapshot.safeAddress,
      snapshotDigest: digest(snapshot),
      policyVersion: policy.version,
      currentRunwayDays: Number(current.toFixed(1)),
      projectedRunwayDays: Number(projected.toFixed(1)),
      actions,
      checks,
    };
    return { ...unsigned, manifestHash: digest(unsigned) };
  }

  const { superToken, forwarder } = addresses();
  const discretionaryStreams = snapshot.streams
    .filter((stream) => !stream.protected && stream.status === "active")
    .sort((left, right) => right.monthlyAmount - left.monthlyAmount);

  const community =
    discretionaryStreams.find((stream) => stream.id === "stream-community") ??
    discretionaryStreams[0];

  const tooling =
    discretionaryStreams.find((stream) => stream.id === "stream-tooling") ??
    discretionaryStreams.find((stream) => stream.id !== community?.id);

  const actions: RecoveryAction[] = [
    {
      id: "wrap-buffer",
      kind: "wrap",
      title: "Extend the stream buffer",
      description: "Wrap 75 stable tokens into Super Tokens so protected streams keep settling.",
      amountUsd: 75,
      keeperhub: {
        path: "/execute/contract-call",
        body: {
          chainId: snapshot.chainId,
          contractAddress: superToken,
          functionName: "upgrade",
          functionArgs: JSON.stringify([
            (BigInt(75) * BigInt("1000000000000000000")).toString(),
          ]),
          abi: superTokenAbi,
        },
      },
    },
  ];

  let communityReduction = 0;
  let toolingReduction = 0;

  if (community) {
    const nextMonthlyAmount = Math.min(10, community.monthlyAmount);
    communityReduction = community.monthlyAmount - nextMonthlyAmount;

    actions.push({
      id: `reduce-${community.id}`,
      kind: "update-flow",
      title: `Throttle ${community.label}`,
      description: `Reduce the discretionary stream from ${community.monthlyAmount} to ${nextMonthlyAmount} per month.`,
      amountUsd: 0,
      receiver: community.receiver,
      previousMonthlyAmount: community.monthlyAmount,
      nextMonthlyAmount,
      keeperhub: {
        path: "/execute/contract-call",
        body: {
          chainId: snapshot.chainId,
          contractAddress: forwarder,
          functionName: "updateFlow",
          functionArgs: JSON.stringify([
            superToken,
            community.receiver,
            monthlyToFlowRate(nextMonthlyAmount),
            "0x",
          ]),
          abi: forwarderAbi,
        },
      },
    });
  }

  if (tooling) {
    toolingReduction = tooling.monthlyAmount;

    actions.push({
      id: `pause-${tooling.id}`,
      kind: "delete-flow",
      title: `Pause ${tooling.label}`,
      description: "Stop this non-critical stream until treasury runway recovers.",
      amountUsd: 0,
      receiver: tooling.receiver,
      previousMonthlyAmount: tooling.monthlyAmount,
      nextMonthlyAmount: 0,
      keeperhub: {
        path: "/execute/contract-call",
        body: {
          chainId: snapshot.chainId,
          contractAddress: forwarder,
          functionName: "deleteFlow",
          functionArgs: JSON.stringify([
            superToken,
            snapshot.safeAddress,
            tooling.receiver,
            "0x",
          ]),
          abi: forwarderAbi,
        },
      },
    });
  }

  const projectedBurn = Math.max(
    0,
    netMonthlyBurn(snapshot) - communityReduction - toolingReduction,
  );
  const projected =
    projectedBurn === 0
      ? current
      : (totalBalance(snapshot) / projectedBurn) * 30;
  const checks = evaluatePolicy(snapshot, policy, actions);
  const createdAt = now.toISOString();
  const unsigned = {
    schema: "runlock.recovery.v1" as const,
    planId: `run-${digest({ snapshot, createdAt }).slice(0, 12)}`,
    createdAt,
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    chainId: snapshot.chainId,
    safeAddress: snapshot.safeAddress,
    snapshotDigest: digest(snapshot),
    policyVersion: policy.version,
    currentRunwayDays: Number(current.toFixed(1)),
    projectedRunwayDays: Number(projected.toFixed(1)),
    actions,
    checks,
  };
  return { ...unsigned, manifestHash: digest(unsigned) };
}

export function assertExecutable(manifest: RecoveryManifest) {
  if (manifest.schema !== "runlock.recovery.v1") throw new Error("Unsupported manifest schema");
  if (manifest.checks.some((check) => !check.passed)) throw new Error("Policy checks failed");
  if (new Date(manifest.expiresAt).getTime() <= Date.now()) throw new Error("Manifest expired; generate a fresh plan");
  const { manifestHash, ...unsigned } = manifest;
  if (digest(unsigned) !== manifestHash) throw new Error("Manifest hash mismatch; execution stopped");
}

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
    usdcx: (process.env.RUNLOCK_USDCX_ADDRESS ?? DEMO_ADDRESSES.usdcx) as `0x${string}`,
    forwarder: (process.env.RUNLOCK_CFA_FORWARDER_ADDRESS ?? DEMO_ADDRESSES.cfaForwarder) as `0x${string}`,
  };
}

export function evaluatePolicy(snapshot: TreasurySnapshot, policy: TreasuryPolicy, actions: RecoveryAction[]): PolicyCheck[] {
  const protectedTouched = actions.some((action) => action.receiver && policy.protectedReceivers.map((value) => value.toLowerCase()).includes(action.receiver.toLowerCase()));
  return [
    { code: "chain-allowlisted", label: "Approved network", passed: policy.allowedChainIds.includes(snapshot.chainId), detail: `${snapshot.chainName} · ${snapshot.chainId}` },
    { code: "contracts-allowlisted", label: "Contracts allowlisted", passed: actions.every((action) => policy.allowedContracts.map((value) => value.toLowerCase()).includes(action.keeperhub.body.contractAddress.toLowerCase())), detail: "USDCx and CFA forwarder only" },
    { code: "protected-recipients", label: "Protected streams untouched", passed: !protectedTouched, detail: "Core engineering and operations preserved" },
    { code: "action-limit", label: "Action value within limit", passed: actions.every((action) => action.amountUsd <= policy.maximumSingleActionUsd), detail: `Maximum ${policy.maximumSingleActionUsd} USDC per action` },
    { code: "simulation-required", label: "Simulation required", passed: policy.requireSimulation, detail: "Execution remains locked until preflight succeeds" },
    { code: "human-approval", label: "Human approval required", passed: policy.requireHumanApproval, detail: "The agent cannot approve its own plan" },
  ];
}

export function createRecoveryPlan(snapshot: TreasurySnapshot, policy: TreasuryPolicy, now = new Date()): RecoveryManifest {
  const current = runwayDays(snapshot);
  const { usdcx, forwarder } = addresses();
  const community = snapshot.streams.find((stream) => stream.id === "stream-community");
  const tooling = snapshot.streams.find((stream) => stream.id === "stream-tooling");
  if (!community || !tooling) throw new Error("Required discretionary streams were not found");

  const actions: RecoveryAction[] = [
    {
      id: "wrap-buffer",
      kind: "wrap",
      title: "Extend the stream buffer",
      description: "Wrap 75 USDC into USDCx so protected streams keep settling.",
      amountUsd: 75,
      keeperhub: { path: "/execute/contract-call", body: { chainId: snapshot.chainId, contractAddress: usdcx, functionName: "upgrade", functionArgs: JSON.stringify([(BigInt(75) * BigInt("1000000000000000000")).toString()]), abi: superTokenAbi } },
    },
    {
      id: "reduce-community",
      kind: "update-flow",
      title: "Throttle community rewards",
      description: "Reduce the discretionary stream from 210 to 10 USDC per month.",
      amountUsd: 0,
      receiver: community.receiver,
      previousMonthlyAmount: community.monthlyAmount,
      nextMonthlyAmount: 10,
      keeperhub: { path: "/execute/contract-call", body: { chainId: snapshot.chainId, contractAddress: forwarder, functionName: "updateFlow", functionArgs: JSON.stringify([usdcx, community.receiver, monthlyToFlowRate(10), "0x"]), abi: forwarderAbi } },
    },
    {
      id: "pause-tooling",
      kind: "delete-flow",
      title: "Pause experimental tooling",
      description: "Stop the non-critical tooling stream until runway recovers.",
      amountUsd: 0,
      receiver: tooling.receiver,
      previousMonthlyAmount: tooling.monthlyAmount,
      nextMonthlyAmount: 0,
      keeperhub: { path: "/execute/contract-call", body: { chainId: snapshot.chainId, contractAddress: forwarder, functionName: "deleteFlow", functionArgs: JSON.stringify([usdcx, snapshot.safeAddress, tooling.receiver, "0x"]), abi: forwarderAbi } },
    },
  ];

  const projectedBurn = netMonthlyBurn(snapshot) - (community.monthlyAmount - 10) - tooling.monthlyAmount;
  const projected = (totalBalance(snapshot) / projectedBurn) * 30;
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

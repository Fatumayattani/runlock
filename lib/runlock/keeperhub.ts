import { digest } from "./canonical.ts";
import { assertExecutable } from "./plan.ts";
import type { ExecutionReceipt, RecoveryManifest, TreasurySnapshot } from "./types.ts";

const baseUrl = (process.env.KEEPERHUB_API_URL ?? "https://app.keeperhub.com/api").replace(/\/$/, "");

function config() {
  return {
    mode: process.env.RUNLOCK_MODE === "live" ? "live" as const : "demo" as const,
    apiKey: process.env.KEEPERHUB_API_KEY,
    monitorWorkflowId: process.env.KEEPERHUB_MONITOR_WORKFLOW_ID,
    liveExecution: process.env.RUNLOCK_LIVE_EXECUTION === "true",
  };
}

type KeeperHubResponse = Record<string, unknown> & {
  error?: string;
  status?: string;
  executionId?: string;
  id?: string;
  completed?: boolean;
  output?: unknown;
  wouldRevert?: boolean;
};

async function request(path: string, init: RequestInit = {}): Promise<KeeperHubResponse> {
  const { apiKey } = config();
  if (!apiKey) throw new Error("KEEPERHUB_API_KEY is required in live mode");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({ error: `KeeperHub returned ${response.status}` })) as KeeperHubResponse;
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `KeeperHub request failed (${response.status})`);
  return body;
}

export async function readKeeperHubSnapshot(): Promise<TreasurySnapshot> {
  const { monitorWorkflowId } = config();
  if (!monitorWorkflowId) throw new Error("KEEPERHUB_MONITOR_WORKFLOW_ID is required in live mode");
  const started = await request(`/workflows/${monitorWorkflowId}/execute`, { method: "POST", body: JSON.stringify({ type: "manual" }) });
  const executionId = started.executionId ?? started.id;
  if (!executionId) throw new Error("KeeperHub did not return an execution ID");
  const receipt = await request(`/workflows/executions/${executionId}/wait?timeoutMs=30000`);
  if (!receipt.completed || receipt.status !== "success") throw new Error(receipt.error ?? "Snapshot workflow did not complete");
  if (!receipt.output || typeof receipt.output !== "object") throw new Error("Snapshot workflow returned an invalid output shape");
  return { ...(receipt.output as TreasurySnapshot), source: "keeperhub", capturedAt: new Date().toISOString() };
}

function demoResult(manifest: RecoveryManifest, actionId: string, index: number, simulate: boolean) {
  const seed = digest(`${manifest.manifestHash}:${actionId}`).slice(0, 64);
  return {
    actionId,
    status: simulate ? "simulated" : "completed",
    executionId: simulate ? undefined : `demo_${seed.slice(0, 18)}`,
    transactionHash: simulate ? undefined : `0x${seed}`,
    transactionLink: simulate ? undefined : `https://sepolia.etherscan.io/tx/0x${seed}`,
    gasEstimate: String(68_400 + index * 11_250),
    wouldRevert: false,
  };
}

export async function runManifest(manifest: RecoveryManifest, simulate: boolean): Promise<ExecutionReceipt> {
  assertExecutable(manifest);
  const settings = config();
  if (!simulate && settings.mode === "live" && !settings.liveExecution) {
    throw new Error("Live broadcasting is locked. Set RUNLOCK_LIVE_EXECUTION=true after reviewing the manifest.");
  }
  const startedAt = new Date().toISOString();
  const results: ExecutionReceipt["results"] = [];

  for (const [index, action] of manifest.actions.entries()) {
    if (settings.mode === "demo") {
      results.push(demoResult(manifest, action.id, index, simulate));
      continue;
    }
    const body = { ...action.keeperhub.body, ...(simulate ? { simulate: true } : {}) };
    try {
      const result = await request(action.keeperhub.path, {
        method: "POST",
        headers: simulate ? {} : { "Idempotency-Key": digest(`${manifest.manifestHash}|${action.id}`) },
        body: JSON.stringify(body),
      });
      results.push({ ...result, actionId: action.id, status: String(result.status ?? (simulate ? "simulated" : "completed")) });
      if ((simulate && result.wouldRevert !== false) || (!simulate && result.status === "failed")) break;
    } catch (error) {
      results.push({ actionId: action.id, status: "failed", error: error instanceof Error ? error.message : "Unknown KeeperHub error" });
      break;
    }
  }

  const failed = results.some((result) => result.status === "failed" || result.wouldRevert === true);
  return {
    mode: settings.mode,
    manifestHash: manifest.manifestHash,
    status: failed ? "failed" : simulate ? "simulated" : "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    results,
  };
}

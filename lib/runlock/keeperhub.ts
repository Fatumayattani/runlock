import { digest } from "./canonical.ts";
import { assertExecutable } from "./plan.ts";
import type {
  ExecutionReceipt,
  RecoveryManifest,
  TreasurySnapshot,
} from "./types.ts";

const baseUrl = (
  process.env.KEEPERHUB_API_URL ??
  "https://app.keeperhub.com/api"
).replace(/\/$/, "");

const KNOWN_TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "unconfirmed",
]);

function config() {
  return {
    mode:
      process.env.RUNLOCK_MODE === "live"
        ? ("live" as const)
        : ("demo" as const),
    apiKey: process.env.KEEPERHUB_API_KEY,
    reserveAddress: process.env.RUNLOCK_RESERVE_ADDRESS,
    monitorWorkflowId:
      process.env.KEEPERHUB_MONITOR_WORKFLOW_ID,
    liveExecution:
      process.env.RUNLOCK_LIVE_EXECUTION === "true",
  };
}

type KeeperHubReceipt = {
  verified?: boolean;
  receiptStatus?: string;
  blockNumber?: string;
};

type KeeperHubResponse = Record<string, unknown> & {
  success?: boolean;
  error?: string | null;
  status?: string;
  executionId?: string;
  id?: string;
  completed?: boolean;
  output?: unknown;
  wouldRevert?: boolean;
  from?: string;
  to?: string;
  gasEstimate?: string;
  transactionHash?: string | null;
  transactionLink?: string | null;
  receipts?: KeeperHubReceipt[];
};

type KeeperHubHttpResult = {
  body: KeeperHubResponse;
  ok: boolean;
  status: number;
  pollIntervalSeconds: number;
};

async function request(
  path: string,
  init: RequestInit = {},
): Promise<KeeperHubHttpResult> {
  const { apiKey } = config();
  if (!apiKey) {
    throw new Error(
      "KEEPERHUB_API_KEY is required in live mode",
    );
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({
    error: `KeeperHub returned ${response.status}`,
  }))) as KeeperHubResponse;
  const hint = Number(
    response.headers.get("x-poll-interval-hint") ?? "2",
  );

  return {
    body,
    ok: response.ok,
    status: response.status,
    pollIntervalSeconds:
      Number.isFinite(hint) && hint >= 0 ? hint : 2,
  };
}

function assertHttpSuccess(result: KeeperHubHttpResult) {
  if (!result.ok) {
    throw new Error(
      typeof result.body.error === "string"
        ? result.body.error
        : `KeeperHub request failed (${result.status})`,
    );
  }
  return result.body;
}

export async function readKeeperHubSnapshot(): Promise<TreasurySnapshot> {
  const { monitorWorkflowId } = config();
  if (!monitorWorkflowId) {
    throw new Error(
      "KEEPERHUB_MONITOR_WORKFLOW_ID is required in live mode",
    );
  }

  const started = assertHttpSuccess(
    await request(`/workflows/${monitorWorkflowId}/execute`, {
      method: "POST",
      body: JSON.stringify({ type: "manual" }),
    }),
  );
  const executionId = started.executionId ?? started.id;
  if (!executionId) {
    throw new Error(
      "KeeperHub did not return an execution ID",
    );
  }

  const receipt = assertHttpSuccess(
    await request(
      `/workflows/executions/${executionId}/wait?timeoutMs=30000`,
    ),
  );
  if (!receipt.completed || receipt.status !== "success") {
    throw new Error(
      receipt.error ?? "Snapshot workflow did not complete",
    );
  }
  if (!receipt.output || typeof receipt.output !== "object") {
    throw new Error(
      "Snapshot workflow returned an invalid output shape",
    );
  }

  return {
    ...(receipt.output as TreasurySnapshot),
    source: "keeperhub",
    capturedAt: new Date().toISOString(),
  };
}

function demoResult(
  manifest: RecoveryManifest,
  actionId: string,
  index: number,
  simulate: boolean,
) {
  const seed = digest(
    `${manifest.manifestHash}:${actionId}`,
  ).slice(0, 64);
  return {
    actionId,
    status: simulate ? "simulated" : "completed",
    executionId: simulate
      ? undefined
      : `demo_${seed.slice(0, 18)}`,
    transactionHash: simulate ? undefined : `0x${seed}`,
    transactionLink: simulate
      ? undefined
      : `https://sepolia.etherscan.io/tx/0x${seed}`,
    gasEstimate: String(68_400 + index * 11_250),
    wouldRevert: false,
  };
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function pollExecution(executionId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await request(
      `/execute/${executionId}/status`,
    );
    const body = assertHttpSuccess(result);
    const status = String(body.status ?? "");

    if (
      result.pollIntervalSeconds === 0 ||
      KNOWN_TERMINAL_STATUSES.has(status)
    ) {
      return body;
    }

    await wait(
      Math.max(250, result.pollIntervalSeconds * 1_000),
    );
  }

  throw new Error(
    "KeeperHub execution did not settle within 60 seconds",
  );
}

function verifiedExecutionResult(
  actionId: string,
  body: KeeperHubResponse,
) {
  const receipts = body.receipts ?? [];
  const receipt = receipts[0];
  const verified =
    receipts.length > 0 &&
    receipts.every(
      (item) =>
        item.verified === true &&
        item.receiptStatus === "success",
    );
  const status = String(body.status ?? "failed");

  return {
    actionId,
    status:
      status === "completed" && verified
        ? "completed"
        : status === "unconfirmed"
          ? "unconfirmed"
          : "failed",
    executionId: body.executionId,
    transactionHash: body.transactionHash ?? undefined,
    transactionLink: body.transactionLink ?? undefined,
    verified,
    receiptStatus: receipt?.receiptStatus,
    blockNumber: receipt?.blockNumber,
    error:
      status === "completed" && !verified
        ? "KeeperHub completed without a verified successful receipt"
        : (body.error ?? undefined),
  };
}

export async function runManifest(
  manifest: RecoveryManifest,
  simulate: boolean,
): Promise<ExecutionReceipt> {
  assertExecutable(manifest);
  const settings = config();
  if (settings.mode === "live" && !settings.reserveAddress) {
    throw new Error(
      "RUNLOCK_RESERVE_ADDRESS is required in live mode",
    );
  }
  if (
    !simulate &&
    settings.mode === "live" &&
    !settings.liveExecution
  ) {
    throw new Error(
      "Live broadcasting is locked. Set RUNLOCK_LIVE_EXECUTION=true after reviewing the manifest.",
    );
  }

  const startedAt = new Date().toISOString();
  const results: ExecutionReceipt["results"] = [];

  for (const [index, action] of manifest.actions.entries()) {
    if (settings.mode === "demo") {
      results.push(
        demoResult(manifest, action.id, index, simulate),
      );
      continue;
    }

    try {
      const response = await request(action.keeperhub.path, {
        method: "POST",
        headers: simulate
          ? {}
          : {
              "Idempotency-Key": digest(
                `${manifest.manifestHash}|${action.id}`,
              ),
            },
        body: JSON.stringify({
          ...action.keeperhub.body,
          ...(simulate ? { simulate: true } : {}),
        }),
      });

      if (simulate) {
        const expectedSender = settings.reserveAddress?.toLowerCase();
        const actualSender = response.body.from?.toLowerCase();
        const senderMatches =
          expectedSender !== undefined &&
          actualSender === expectedSender;
        const passed =
          response.ok &&
          response.body.success === true &&
          response.body.wouldRevert === false &&
          senderMatches;
        results.push({
          actionId: action.id,
          status: passed ? "simulated" : "failed",
          executionId: response.body.executionId,
          transactionHash:
            response.body.transactionHash ?? undefined,
          transactionLink:
            response.body.transactionLink ?? undefined,
          gasEstimate: response.body.gasEstimate,
          wouldRevert: response.body.wouldRevert,
          from: response.body.from,
          to: response.body.to,
          error: !senderMatches
            ? "KeeperHub simulation used an unexpected sender"
            : (response.body.error ?? undefined),
        });
        if (!passed) break;
        continue;
      }

      const started = assertHttpSuccess(response);
      if (!started.executionId) {
        throw new Error(
          "KeeperHub did not return an execution ID",
        );
      }

      try {
        const settled = await pollExecution(started.executionId);
        const result = verifiedExecutionResult(
          action.id,
          settled,
        );
        results.push(result);
        if (result.status !== "completed") break;
      } catch (error) {
        results.push({
          actionId: action.id,
          status: "unconfirmed",
          executionId: started.executionId,
          transactionHash:
            started.transactionHash ?? undefined,
          transactionLink:
            started.transactionLink ?? undefined,
          error:
            error instanceof Error
              ? error.message
              : "KeeperHub status could not be confirmed",
        });
        break;
      }
    } catch (error) {
      results.push({
        actionId: action.id,
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Unknown KeeperHub error",
      });
      break;
    }
  }

  const failed = results.some(
    (result) => result.status === "failed",
  );
  const unconfirmed = results.some(
    (result) => result.status === "unconfirmed",
  );

  return {
    mode: settings.mode,
    manifestHash: manifest.manifestHash,
    status: failed
      ? "failed"
      : unconfirmed
        ? "unconfirmed"
        : simulate
          ? "simulated"
          : "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    results,
  };
}

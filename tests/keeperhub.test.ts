import assert from "node:assert/strict";
import test from "node:test";
import { defaultPolicy, demoSnapshot } from "../lib/runlock/demo.ts";
import { runManifest } from "../lib/runlock/keeperhub.ts";
import {
  createRecoveryPlan,
  policyForSnapshot,
} from "../lib/runlock/plan.ts";

function livePlan() {
  process.env.RUNLOCK_BASE_TOKEN_ADDRESS =
    "0x1000000000000000000000000000000000000002";
  const snapshot = {
    ...demoSnapshot,
    source: "rpc" as const,
    liquidBaseToken: 0,
    superTokenBalance: 0,
    monthlyInflows: 0,
    otherMonthlyCosts: 100,
    streams: demoSnapshot.streams
      .filter((stream) => stream.protected)
      .map((stream) => ({
        ...stream,
        monthlyAmount: 0,
        status: "paused" as const,
      })),
  };
  const policy = policyForSnapshot(snapshot, defaultPolicy);
  return createRecoveryPlan(
    snapshot,
    policy,
    new Date(Date.now() + 60_000),
  );
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

test("live simulation sends the locked top-up without broadcasting", async () => {
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.RUNLOCK_MODE;
  const originalKey = process.env.KEEPERHUB_API_KEY;
  const originalReserve = process.env.RUNLOCK_RESERVE_ADDRESS;
  process.env.RUNLOCK_MODE = "live";
  process.env.KEEPERHUB_API_KEY = "kh_test";
  process.env.RUNLOCK_RESERVE_ADDRESS =
    "0x07e60ae18a26effbb9301c0d2cec0419e5abf09b";

  let observedBody: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    observedBody = JSON.parse(String(init?.body));
    return jsonResponse({
      success: true,
      status: "simulated",
      from: "0x07e60ae18a26effbb9301c0d2cec0419e5abf09b",
      to: "0x1000000000000000000000000000000000000002",
      wouldRevert: false,
      gasEstimate: "65000",
    });
  };

  try {
    const receipt = await runManifest(livePlan(), true);
    assert.equal(receipt.status, "simulated");
    assert.equal(receipt.results[0]?.wouldRevert, false);
    assert.equal(observedBody.simulate, true);
    assert.equal(observedBody.amount, "100");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMode === undefined) delete process.env.RUNLOCK_MODE;
    else process.env.RUNLOCK_MODE = originalMode;
    if (originalKey === undefined) delete process.env.KEEPERHUB_API_KEY;
    else process.env.KEEPERHUB_API_KEY = originalKey;
    if (originalReserve === undefined) delete process.env.RUNLOCK_RESERVE_ADDRESS;
    else process.env.RUNLOCK_RESERVE_ADDRESS = originalReserve;
  }
});

test("live execution requires a verified successful receipt", async () => {
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.RUNLOCK_MODE;
  const originalKey = process.env.KEEPERHUB_API_KEY;
  const originalSwitch = process.env.RUNLOCK_LIVE_EXECUTION;
  const originalReserve = process.env.RUNLOCK_RESERVE_ADDRESS;
  process.env.RUNLOCK_MODE = "live";
  process.env.KEEPERHUB_API_KEY = "kh_test";
  process.env.RUNLOCK_LIVE_EXECUTION = "true";
  process.env.RUNLOCK_RESERVE_ADDRESS =
    "0x07e60ae18a26effbb9301c0d2cec0419e5abf09b";

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse(
        { executionId: "exec_1", status: "pending" },
        202,
      );
    }
    return jsonResponse({
      executionId: "exec_1",
      status: "completed",
      transactionHash: `0x${"a".repeat(64)}`,
      transactionLink: `https://sepolia.etherscan.io/tx/0x${"a".repeat(64)}`,
      receipts: [
        {
          verified: true,
          receiptStatus: "success",
          blockNumber: "123",
        },
      ],
    });
  };

  try {
    const receipt = await runManifest(livePlan(), false);
    assert.equal(receipt.status, "completed");
    assert.equal(receipt.results[0]?.verified, true);
    assert.equal(receipt.results[0]?.receiptStatus, "success");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMode === undefined) delete process.env.RUNLOCK_MODE;
    else process.env.RUNLOCK_MODE = originalMode;
    if (originalKey === undefined) delete process.env.KEEPERHUB_API_KEY;
    else process.env.KEEPERHUB_API_KEY = originalKey;
    if (originalSwitch === undefined) delete process.env.RUNLOCK_LIVE_EXECUTION;
    else process.env.RUNLOCK_LIVE_EXECUTION = originalSwitch;
    if (originalReserve === undefined) delete process.env.RUNLOCK_RESERVE_ADDRESS;
    else process.env.RUNLOCK_RESERVE_ADDRESS = originalReserve;
  }
});

test("an accepted execution preserves its ID when polling cannot confirm it", async () => {
  const originalMode = process.env.RUNLOCK_MODE;
  const originalExecution = process.env.RUNLOCK_LIVE_EXECUTION;
  const originalKey = process.env.KEEPERHUB_API_KEY;
  const originalReserve = process.env.RUNLOCK_RESERVE_ADDRESS;
  const originalFetch = globalThis.fetch;

  process.env.RUNLOCK_MODE = "live";
  process.env.RUNLOCK_LIVE_EXECUTION = "true";
  process.env.KEEPERHUB_API_KEY = "kh_test";
  process.env.RUNLOCK_RESERVE_ADDRESS =
    "0x5555555555555555555555555555555555555555";

  let requestCount = 0;
  globalThis.fetch = (async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(JSON.stringify({
        executionId: "execution-pending",
        status: "pending",
      }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      error: "Status service unavailable",
    }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const receipt = await runManifest(livePlan(), false);
    assert.equal(receipt.status, "unconfirmed");
    assert.equal(receipt.results[0]?.status, "unconfirmed");
    assert.equal(
      receipt.results[0]?.executionId,
      "execution-pending",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMode === undefined) delete process.env.RUNLOCK_MODE;
    else process.env.RUNLOCK_MODE = originalMode;
    if (originalExecution === undefined) delete process.env.RUNLOCK_LIVE_EXECUTION;
    else process.env.RUNLOCK_LIVE_EXECUTION = originalExecution;
    if (originalKey === undefined) delete process.env.KEEPERHUB_API_KEY;
    else process.env.KEEPERHUB_API_KEY = originalKey;
    if (originalReserve === undefined) delete process.env.RUNLOCK_RESERVE_ADDRESS;
    else process.env.RUNLOCK_RESERVE_ADDRESS = originalReserve;
  }
});

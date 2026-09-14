import test from "node:test";
import assert from "node:assert/strict";
import { canonicalize, digest } from "../lib/runlock/canonical.ts";
import { defaultPolicy, demoSnapshot } from "../lib/runlock/demo.ts";
import { monthlyToFlowRate, netMonthlyBurn, runwayDays, totalBalance } from "../lib/runlock/math.ts";
import { assertExecutable, createRecoveryPlan, evaluatePolicy } from "../lib/runlock/plan.ts";
import { runManifest } from "../lib/runlock/keeperhub.ts";

test("canonical JSON is independent of object key order", () => {
  assert.equal(canonicalize({ b: 2, a: { d: 4, c: 3 } }), canonicalize({ a: { c: 3, d: 4 }, b: 2 }));
});

test("digest is stable and SHA-256 sized", () => {
  assert.equal(digest({ run: "same" }), digest({ run: "same" }));
  assert.equal(digest({ run: "same" }).length, 64);
});

test("runway uses liquid plus SuperToken reserves", () => {
  assert.equal(totalBalance(demoSnapshot), 530);
  assert.equal(netMonthlyBurn(demoSnapshot), 820);
  assert.equal(Number(runwayDays(demoSnapshot).toFixed(1)), 19.4);
});

test("monthly amounts convert to deterministic wei-per-second rates", () => {
  assert.equal(monthlyToFlowRate(10), "3858024691358");
});

test("recovery plan reaches the thirty day target", () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy, new Date("2026-09-11T10:00:00Z"));
  assert.equal(plan.projectedRunwayDays, 30);
  assert.equal(plan.actions.length, 3);
});

test("recovery plan never changes protected streams", () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy);
  const protectedReceivers = new Set(defaultPolicy.protectedReceivers.map((value) => value.toLowerCase()));
  assert.equal(plan.actions.some((action) => action.receiver && protectedReceivers.has(action.receiver.toLowerCase())), false);
});

test("all default policy gates pass", () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy);
  assert.equal(evaluatePolicy(demoSnapshot, defaultPolicy, plan.actions).every((check) => check.passed), true);
});

test("policy gate rejects an unapproved chain", () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy);
  const checks = evaluatePolicy({ ...demoSnapshot, chainId: 1 }, defaultPolicy, plan.actions);
  assert.equal(checks.find((check) => check.code === "chain-allowlisted")?.passed, false);
});

test("valid locked manifest is executable", () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy, new Date(Date.now() + 60_000));
  assert.doesNotThrow(() => assertExecutable(plan));
});

test("tampering with a locked action fails closed", () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy, new Date(Date.now() + 60_000));
  plan.actions[0].amountUsd = 76;
  assert.throws(() => assertExecutable(plan), /hash mismatch/);
});

test("expired manifests fail closed", () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy, new Date("2020-01-01T00:00:00Z"));
  assert.throws(() => assertExecutable(plan), /expired/);
});

test("demo preflight returns one simulation result per action", async () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy, new Date(Date.now() + 60_000));
  const receipt = await runManifest(plan, true);
  assert.equal(receipt.mode, "demo");
  assert.equal(receipt.status, "simulated");
  assert.equal(receipt.results.length, plan.actions.length);
  assert.equal(receipt.results.every((result) => result.wouldRevert === false), true);
});

test("demo execution receipts are deterministic for a manifest", async () => {
  const plan = createRecoveryPlan(demoSnapshot, defaultPolicy, new Date(Date.now() + 60_000));
  const first = await runManifest(plan, false);
  const second = await runManifest(plan, false);
  assert.equal(first.results[0].transactionHash, second.results[0].transactionHash);
  assert.equal(first.mode, "demo");
});

test("recovery plan supports a live treasury without discretionary streams", () => {
  const liveSnapshot = {
    ...demoSnapshot,
    source: "keeperhub" as const,
    streams: demoSnapshot.streams.filter((stream) => stream.protected),
  };

  const plan = createRecoveryPlan(
    liveSnapshot,
    defaultPolicy,
    new Date("2026-09-14T09:30:00Z"),
  );

  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].kind, "wrap");
  assert.equal(plan.projectedRunwayDays, plan.currentRunwayDays);
});

import assert from "node:assert/strict";
import test from "node:test";
import verifiedReceipt from "../docs/evidence/keeperhub-live-receipt.json" with { type: "json" };
import {
  auditReceiptKey,
  mergeAuditReceipts,
} from "../lib/runlock/audit.ts";
import type { ExecutionReceipt } from "../lib/runlock/types";

const verified = verifiedReceipt as ExecutionReceipt;

test("verified evidence uses its transaction hash as the audit key", () => {
  assert.equal(
    auditReceiptKey(verified),
    verified.results[0].transactionHash?.toLowerCase(),
  );
});

test("verified and browser-local copies are deduplicated", () => {
  const duplicate = structuredClone(verified);
  const merged = mergeAuditReceipts([duplicate], [verified]);

  assert.equal(merged.length, 1);
});

test("a distinct simulation remains in the audit trail", () => {
  const simulation: ExecutionReceipt = {
    mode: "demo",
    manifestHash: verified.manifestHash,
    status: "simulated",
    startedAt: "2026-09-15T10:00:00.000Z",
    completedAt: "2026-09-15T10:00:01.000Z",
    results: [{
      actionId: "reserve-top-up",
      status: "simulated",
      gasEstimate: "51875",
      wouldRevert: false,
    }],
  };

  assert.equal(
    mergeAuditReceipts([simulation], [verified]).length,
    2,
  );
});

import type { ExecutionReceipt } from "./types";

export function auditReceiptKey(
  receipt: ExecutionReceipt,
): string {
  const result = receipt.results.find(
    (item) => item.transactionHash || item.executionId,
  );

  return (
    result?.transactionHash?.toLowerCase() ??
    result?.executionId ??
    [
      receipt.mode,
      receipt.manifestHash,
      receipt.status,
      receipt.completedAt,
    ].join(":")
  );
}

export function mergeAuditReceipts(
  ...collections: ExecutionReceipt[][]
): ExecutionReceipt[] {
  const seen = new Set<string>();

  return collections.flat().filter((receipt) => {
    const key = auditReceiptKey(receipt);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

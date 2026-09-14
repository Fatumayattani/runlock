import { demoSnapshot } from "./demo.ts";
import { readLiveTreasurySnapshot } from "./live.ts";
import type { TreasurySnapshot } from "./types.ts";

export async function readTreasurySnapshot(): Promise<TreasurySnapshot> {
  if (process.env.RUNLOCK_MODE === "live") {
    return readLiveTreasurySnapshot();
  }

  return {
    ...demoSnapshot,
    capturedAt: new Date().toISOString(),
  };
}

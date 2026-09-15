import { Dashboard } from "./dashboard";
import verifiedReceipt from "@/docs/evidence/keeperhub-live-receipt.json";
import { defaultPolicy } from "@/lib/runlock/demo";
import {
  createRecoveryPlan,
  policyForSnapshot,
} from "@/lib/runlock/plan";
import { readTreasurySnapshot } from "@/lib/runlock/snapshot";
import type { ExecutionReceipt } from "@/lib/runlock/types";

const verifiedExecution = verifiedReceipt as ExecutionReceipt;

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await readTreasurySnapshot();
  const policy = policyForSnapshot(snapshot, defaultPolicy);
  const manifest = createRecoveryPlan(
    snapshot,
    policy,
  );

  return (
    <Dashboard
      initialSnapshot={snapshot}
      initialManifest={manifest}
      verifiedExecutions={[verifiedExecution]}
      policy={policy}
    />
  );
}

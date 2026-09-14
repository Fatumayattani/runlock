import { Dashboard } from "./dashboard";
import { defaultPolicy } from "@/lib/runlock/demo";
import {
  createRecoveryPlan,
  policyForSnapshot,
} from "@/lib/runlock/plan";
import { readTreasurySnapshot } from "@/lib/runlock/snapshot";

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
      policy={policy}
    />
  );
}

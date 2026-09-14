import { Dashboard } from "./dashboard";
import { defaultPolicy } from "@/lib/runlock/demo";
import { createRecoveryPlan } from "@/lib/runlock/plan";
import { readTreasurySnapshot } from "@/lib/runlock/snapshot";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await readTreasurySnapshot();
  const manifest = createRecoveryPlan(
    snapshot,
    defaultPolicy,
  );

  return (
    <Dashboard
      initialSnapshot={snapshot}
      initialManifest={manifest}
      policy={defaultPolicy}
    />
  );
}

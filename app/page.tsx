import { Dashboard } from "./dashboard";
import { defaultPolicy, demoSnapshot } from "@/lib/runlock/demo";
import { createRecoveryPlan } from "@/lib/runlock/plan";

export const dynamic = "force-dynamic";

export default function Home() {
  const snapshot = { ...demoSnapshot, capturedAt: new Date().toISOString() };
  const manifest = createRecoveryPlan(snapshot, defaultPolicy);
  return <Dashboard initialSnapshot={snapshot} initialManifest={manifest} policy={defaultPolicy} />;
}

import { NextResponse } from "next/server";
import { demoSnapshot } from "@/lib/runlock/demo";
import { readKeeperHubSnapshot } from "@/lib/runlock/keeperhub";

export async function GET() {
  try {
    const snapshot = process.env.RUNLOCK_MODE === "live" ? await readKeeperHubSnapshot() : { ...demoSnapshot, capturedAt: new Date().toISOString() };
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Snapshot failed" }, { status: 500 });
  }
}

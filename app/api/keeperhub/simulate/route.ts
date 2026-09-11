import { NextResponse } from "next/server";
import { runManifest } from "@/lib/runlock/keeperhub";
import type { RecoveryManifest } from "@/lib/runlock/types";

export async function POST(request: Request) {
  try {
    const manifest = await request.json() as RecoveryManifest;
    return NextResponse.json(await runManifest(manifest, true));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Simulation failed" }, { status: 400 });
  }
}

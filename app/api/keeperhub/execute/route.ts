import { NextResponse } from "next/server";
import { runManifest } from "@/lib/runlock/keeperhub";
import type { RecoveryManifest } from "@/lib/runlock/types";

export async function POST(request: Request) {
  try {
    const manifest = await request.json() as RecoveryManifest;
    if (request.headers.get("x-runlock-approval") !== manifest.manifestHash) {
      return NextResponse.json({ error: "Approval hash does not match the locked manifest" }, { status: 403 });
    }
    const preflight = await runManifest(manifest, true);
    if (preflight.status !== "simulated") {
      return NextResponse.json(
        { error: "KeeperHub preflight failed; execution remains locked", preflight },
        { status: 400 },
      );
    }
    return NextResponse.json(await runManifest(manifest, false));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution failed" }, { status: 400 });
  }
}

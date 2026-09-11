import { NextResponse } from "next/server";
import { defaultPolicy } from "@/lib/runlock/demo";
import { createRecoveryPlan } from "@/lib/runlock/plan";
import type { TreasuryPolicy, TreasurySnapshot } from "@/lib/runlock/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { snapshot: TreasurySnapshot; policy?: TreasuryPolicy };
    return NextResponse.json(createRecoveryPlan(body.snapshot, body.policy ?? defaultPolicy));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Plan generation failed" }, { status: 400 });
  }
}

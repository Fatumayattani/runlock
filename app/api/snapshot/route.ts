import { NextResponse } from "next/server";
import { readTreasurySnapshot } from "@/lib/runlock/snapshot";

export async function GET() {
  try {
    return NextResponse.json(
      await readTreasurySnapshot(),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Snapshot failed",
      },
      { status: 500 },
    );
  }
}

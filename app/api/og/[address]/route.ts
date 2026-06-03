import { NextResponse } from "next/server";

/**
 * Dynamic share image. STUB for now — the designer ships the OG image.
 * Returns 501 Not Implemented until then.
 */
export async function GET() {
  return NextResponse.json(
    { error: "OG image not implemented yet" },
    { status: 501 },
  );
}

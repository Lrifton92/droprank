import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { BlockscoutError } from "@/lib/providers/blockscout";
import { scoreAddress } from "@/lib/score-address";
import { recordAndRankScore } from "@/lib/percentile";
import { LruCache, checkRateLimit } from "@/lib/cache";
import { getOrSetCached } from "@/lib/shared-cache";
import type { ScoreResult } from "@/lib/types";

const cache = new LruCache<ScoreResult>(500, 5 * 60 * 1000);
const SCORE_TTL_S = 5 * 60;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!(await checkRateLimit(req, {
    prefix: "score",
    limit: 30,
    windowSeconds: 60,
  }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const key = address.toLowerCase();

  try {
    // L1 (in-memory) -> L2 (Upstash) -> compute. Never fails on store errors.
    const result = await getOrSetCached(cache, key, SCORE_TTL_S, async () => {
      const r = await scoreAddress(key, req.signal);
      // Record + rank in the percentile store (never throws; static fallback).
      r.percentile = await recordAndRankScore(key, r.score);
      return r;
    });
    return NextResponse.json(result, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300" },
    });
  } catch (e) {
    if (e instanceof BlockscoutError) {
      if (e.kind === "invalid_address") {
        return NextResponse.json({ error: "Invalid address" }, { status: 400 });
      }
      console.error("[score] upstream error:", e.kind, e.message);
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 502 },
      );
    }
    console.error("[score] internal error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

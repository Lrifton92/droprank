import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { BlockscoutError } from "@/lib/providers/blockscout";
import { scoreAddress } from "@/lib/score-address";
import { recordAndRankScore } from "@/lib/percentile";
import { LruCache, checkRateLimit } from "@/lib/cache";
import type { ScoreResult } from "@/lib/types";

const cache = new LruCache<ScoreResult>(500, 5 * 60 * 1000);

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
  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300" },
    });
  }

  try {
    const result = await scoreAddress(key, req.signal);
    // Record + rank in the percentile store (never throws; static fallback).
    result.percentile = await recordAndRankScore(key, result.score);

    cache.set(key, result);
    return NextResponse.json(result, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300" },
    });
  } catch (e) {
    if (e instanceof BlockscoutError) {
      const status = e.kind === "invalid_address" ? 400 : 502;
      return NextResponse.json({ error: e.message, kind: e.kind }, { status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

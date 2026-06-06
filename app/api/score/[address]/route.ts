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

  const addr = address.toLowerCase();
  // v2 barème: the breakdown shape changed (new keys, identity regrouped, malus
  // line). A versioned cache-key prefix starts a clean L1/L2 namespace so a stale
  // payload can't be served post-deploy. Bumped v2->v3 on 2026-06-06 when bridge
  // detection started consuming internal txs (Across/Socket + inbound fills): a
  // wallet's bridge criterion can flip true, so old "v2:" payloads MUST NOT be
  // reused. Stale payloads expire on their own; the UI tolerates either shape.
  const key = `v3:${addr}`;

  try {
    // L1 (in-memory) -> L2 (Upstash) -> compute. Never fails on store errors.
    const result = await getOrSetCached(cache, "score", key, SCORE_TTL_S, async () => {
      const r = await scoreAddress(addr, req.signal);
      // Record + rank in the percentile store (never throws; static fallback).
      r.percentile = await recordAndRankScore(addr, r.score);
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

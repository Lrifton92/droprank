// Touched to reset the dev in-memory L1 after a response-shape change.
import { NextRequest, NextResponse } from "next/server";
import { fetchYields, isChainSlug, type YieldsResult } from "@/lib/yields";
import { LruCache, checkRateLimit } from "@/lib/cache";
import { getOrSetCached } from "@/lib/shared-cache";

// 30-minute in-memory cache, one entry per chain slug (4 supported chains). The
// ranking is global per chain (not per-user/lang), so one entry each is enough.
// The daily cron pre-warms only "base" in L2 (Upstash) at 06:00 UTC; the other
// chains warm on demand (Hobby plan — intentional).
const cache = new LruCache<YieldsResult>(4, 30 * 60 * 1000);
const YIELDS_TTL_S = 30 * 60;

export async function GET(req: NextRequest) {
  // Each miss fans out to the DefiLlama pools endpoint; a distributed limiter
  // (Upstash) is needed on serverless. The daily cron call passes no query
  // params and is rate-limited like any other client (well under the limit).
  if (!(await checkRateLimit(req, { prefix: "yields", limit: 30, windowSeconds: 60 }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // ?chain= (default "base", keeping the param-less cron call identical).
  // Strict whitelist: an unknown slug is a 400, never a silent fallback.
  const slug = req.nextUrl.searchParams.get("chain") ?? "base";
  if (!isChainSlug(slug)) {
    return NextResponse.json({ error: "Unknown chain" }, { status: 400 });
  }

  const headers = {
    "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
  };

  try {
    // L1 (in-memory) -> L2 (Upstash) -> compute. Never fails on store errors.
    // The cache key is the slug: one L1/L2 entry per chain, no collision (the
    // "yields" namespace already isolates L2 from other routes).
    const result = await getOrSetCached(cache, "yields", slug, YIELDS_TTL_S, () =>
      fetchYields(slug, req.signal),
    );
    return NextResponse.json(result, { headers });
  } catch {
    // fetchYields degrades internally; this guards only unexpected failures.
    return NextResponse.json({ error: "Yields unavailable" }, { status: 502 });
  }
}

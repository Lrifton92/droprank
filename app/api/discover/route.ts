import { NextRequest, NextResponse } from "next/server";
import { fetchDiscover, type DiscoverItem } from "@/lib/discover";
import { LruCache, checkRateLimit } from "@/lib/cache";

// 30-minute in-memory cache. Single key: the whole "new on Base" list.
const cache = new LruCache<DiscoverItem[]>(1, 30 * 60 * 1000);
const CACHE_KEY = "new-on-base";

export async function GET(req: NextRequest) {
  // Distributed rate-limit (Upstash) — each miss fans out to two third-party
  // sources, so the in-memory limiter is insufficient on serverless.
  if (!(await checkRateLimit(req, { prefix: "discover", limit: 30, windowSeconds: 60 }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const headers = {
    "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
  };

  const cached = cache.get(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ items: cached }, { headers });
  }

  try {
    const items = await fetchDiscover(req.signal);
    cache.set(CACHE_KEY, items);
    return NextResponse.json({ items }, { headers });
  } catch (err) {
    // fetchDiscover degrades internally; this guards only unexpected failures.
    console.error("discover route failed:", err);
    return NextResponse.json({ error: "Discover unavailable" }, { status: 502 });
  }
}

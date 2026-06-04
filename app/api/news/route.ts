import { NextRequest, NextResponse } from "next/server";
import { fetchAllNews, type NewsItem } from "@/lib/news";
import { LruCache, checkRateLimit } from "@/lib/cache";

// 15-minute in-memory cache (per the news spec). Single key: the whole feed.
const cache = new LruCache<NewsItem[]>(1, 15 * 60 * 1000);
const CACHE_KEY = "base-news";

export async function GET(req: NextRequest) {
  // Distributed rate-limit (Upstash) — each miss fans out to 7 third-party feeds,
  // so the in-memory limiter was insufficient on serverless. (re-audit MED-1)
  if (!(await checkRateLimit(req, { prefix: "news", limit: 30, windowSeconds: 60 }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const headers = {
    "cache-control": "public, s-maxage=900, stale-while-revalidate=1800",
  };

  const cached = cache.get(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ items: cached }, { headers });
  }

  try {
    const items = await fetchAllNews(req.signal);
    cache.set(CACHE_KEY, items);
    return NextResponse.json({ items }, { headers });
  } catch {
    // fetchAllNews degrades internally; this guards only unexpected failures.
    return NextResponse.json({ error: "News unavailable" }, { status: 502 });
  }
}

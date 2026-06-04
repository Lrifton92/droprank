import { NextRequest, NextResponse } from "next/server";
import { fetchAllNews, type NewsItem } from "@/lib/news";
import { LruCache, checkRateLimit } from "@/lib/cache";
import { translateToFr } from "@/lib/translate";
import { isLocale } from "@/i18n/config";

// 15-minute in-memory cache (per the news spec). Keyed by language so the FR
// (translated) and EN (VO) feeds never mix; room for both.
const cache = new LruCache<NewsItem[]>(2, 15 * 60 * 1000);

/**
 * Translate title + description of every item to FR, position-mapped so the
 * cached LruCache (per text) is hit when titles repeat across refreshes. Any
 * per-text failure degrades to VO inside translateToFr — this never throws.
 */
async function translateNews(items: NewsItem[]): Promise<NewsItem[]> {
  const fr = await translateToFr([
    ...items.map((it) => it.title),
    ...items.map((it) => it.description),
  ]);
  const n = items.length;
  return items.map((it, i) => ({
    ...it,
    title: fr[i] ?? it.title,
    description: fr[n + i] ?? it.description,
  }));
}

export async function GET(req: NextRequest) {
  // Distributed rate-limit (Upstash) — each miss fans out to 7 third-party feeds,
  // so the in-memory limiter was insufficient on serverless. (re-audit MED-1)
  if (!(await checkRateLimit(req, { prefix: "news", limit: 30, windowSeconds: 60 }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const langParam = req.nextUrl.searchParams.get("lang");
  const lang = isLocale(langParam) ? langParam : "en";

  const headers = {
    "cache-control": "public, s-maxage=900, stale-while-revalidate=1800",
  };

  const cacheKey = `base-news:${lang}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ items: cached }, { headers });
  }

  try {
    const base = await fetchAllNews(req.signal);
    const items = lang === "fr" ? await translateNews(base) : base;
    cache.set(cacheKey, items);
    return NextResponse.json({ items }, { headers });
  } catch {
    // fetchAllNews degrades internally; this guards only unexpected failures.
    return NextResponse.json({ error: "News unavailable" }, { status: 502 });
  }
}

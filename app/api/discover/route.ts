import { NextRequest, NextResponse } from "next/server";
import { fetchDiscover, type DiscoverItem } from "@/lib/discover";
import { LruCache, checkRateLimit } from "@/lib/cache";
import { getOrSetCached } from "@/lib/shared-cache";
import { translateToFr } from "@/lib/translate";
import { isLocale } from "@/i18n/config";

// 30-minute in-memory cache. Keyed by language so the FR (translated) and EN (VO)
// lists never mix; room for both.
const cache = new LruCache<DiscoverItem[]>(2, 30 * 60 * 1000);
const DISCOVER_TTL_S = 30 * 60;

/**
 * Translate ONLY the headlines of "announced" items to FR. Protocol names
 * (type "protocol" -> `title`) are proper nouns and stay verbatim, as do
 * `category`, `tvl` and `source`. DiscoverItem carries no `description`, so the
 * headline is the only human-language field to localize. Degrades to VO on any
 * per-text failure inside translateToFr (never throws).
 */
async function translateDiscover(items: DiscoverItem[]): Promise<DiscoverItem[]> {
  const announced = items.filter((it) => it.type === "announced");
  if (announced.length === 0) return items;
  const fr = await translateToFr(announced.map((it) => it.title));
  let i = 0;
  return items.map((it) =>
    it.type === "announced" ? { ...it, title: fr[i++] ?? it.title } : it,
  );
}

export async function GET(req: NextRequest) {
  // Distributed rate-limit (Upstash) — each miss fans out to two third-party
  // sources, so the in-memory limiter is insufficient on serverless.
  if (!(await checkRateLimit(req, { prefix: "discover", limit: 30, windowSeconds: 60 }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const langParam = req.nextUrl.searchParams.get("lang");
  const lang = isLocale(langParam) ? langParam : "en";

  const headers = {
    "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600",
  };

  try {
    // L1 (in-memory) -> L2 (Upstash) -> compute. Never fails on store errors.
    const items = await getOrSetCached(cache, "discover", lang, DISCOVER_TTL_S, async () => {
      const base = await fetchDiscover(req.signal);
      return lang === "fr" ? await translateDiscover(base) : base;
    });
    return NextResponse.json({ items }, { headers });
  } catch (err) {
    // fetchDiscover degrades internally; this guards only unexpected failures.
    console.error("discover route failed:", err);
    return NextResponse.json({ error: "Discover unavailable" }, { status: 502 });
  }
}

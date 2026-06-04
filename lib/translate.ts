/**
 * EN→FR translation for scraped news/discover text.
 *
 * Uses the public, UNOFFICIAL Google Translate endpoint (gtx client, no API key).
 * Risk acknowledged: this endpoint can be rate-limited or blocked at any time
 * (it is not a supported API). The whole module is therefore built to DEGRADE
 * GRACEFULLY: any error, timeout or unexpected payload on a given text falls back
 * to the ORIGINAL English string. It never throws and never yields a blank, so the
 * worst case is "the app shows VO" — never an error or an empty card.
 *
 * Cost control: per-text in-memory cache (a title is translated once for the
 * process lifetime), in-batch de-dup, bounded concurrency, and a per-call timeout.
 *
 * Pure-ish & testable: `parseGoogleTranslate` is exported for unit tests; the only
 * side effect is the network fetch (mockable via global `fetch`).
 */

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const CALL_TIMEOUT_MS = 4_000;
const CONCURRENCY = 6;
/** Bounded so a long-running process can't grow the cache unbounded. */
const CACHE_MAX = 2_000;

/** Process-lifetime cache: original EN text -> FR translation. */
const cache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  return cache.get(key);
}

function cacheSet(key: string, value: string): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Extract the translated text from Google's nested response shape:
 *   [ [ ["<fr>", "<en>", ...], ["<fr2>", "<en2>", ...], ... ], ... ]
 * The translation is split into segments (one per sentence/chunk); we concat the
 * first element of each. Returns null on any shape it doesn't recognize, so the
 * caller can fall back to the original.
 */
export function parseGoogleTranslate(json: unknown): string | null {
  if (!Array.isArray(json)) return null;
  const segments = json[0];
  if (!Array.isArray(segments) || segments.length === 0) return null;
  let out = "";
  for (const seg of segments) {
    if (!Array.isArray(seg) || typeof seg[0] !== "string") return null;
    out += seg[0];
  }
  return out.length > 0 ? out : null;
}

/** Translate one text. Returns the original on any failure (never throws). */
async function translateOne(text: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const url =
      `${ENDPOINT}?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return text;
    const json = await res.json();
    return parseGoogleTranslate(json) ?? text;
  } catch {
    // Timeout, network error, abort or bad JSON: fall back to VO.
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translate a batch of EN strings to FR, order-preserving.
 *
 * - Empty strings pass through unchanged (no fetch).
 * - Cached texts are reused (no fetch).
 * - Identical texts within the batch are translated once (in-batch de-dup).
 * - Remaining unique texts are fetched with bounded concurrency.
 * - Any per-text failure degrades to the original English string.
 */
export async function translateToFr(texts: string[]): Promise<string[]> {
  // Unique non-empty texts that aren't already cached.
  const pending: string[] = [];
  const seen = new Set<string>();
  for (const t of texts) {
    if (!t || cacheGet(t) !== undefined || seen.has(t)) continue;
    seen.add(t);
    pending.push(t);
  }

  // Fetch the pending set with a simple worker pool.
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const idx = cursor++;
      const text = pending[idx]!;
      const fr = await translateOne(text);
      cacheSet(text, fr);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
  );

  // Resolve every input from the cache; empties and any uncached (shouldn't
  // happen) fall back to the original.
  return texts.map((t) => (t ? (cacheGet(t) ?? t) : t));
}

/** Test-only: clear the module cache between cases. */
export const __test = { clearCache: () => cache.clear() };

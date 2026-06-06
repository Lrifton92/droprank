/**
 * Talent Protocol Builder Score provider.
 *
 * The Builder Score is created OFF-CHAIN on talentprotocol.com, so it cannot be
 * derived from the tx list — it must be read from the Talent API. The public
 * endpoint requires an X-API-KEY, supplied via the server-only `TALENT_API_KEY`
 * env var (NEVER NEXT_PUBLIC — the key must not reach the browser).
 *
 *   GET https://api.talentprotocol.com/score?id=<address>&account_source=wallet
 *   header: X-API-KEY: <key>
 *   200 -> { "score": { "points": <number>, ... } }   (probed live: 401 w/o key)
 *
 * Never-fail: any error (missing key, HTTP error, network, malformed body) yields
 * 0 — the talent-builder-score quest then simply falls back to its onchain signal
 * and the scan is otherwise unaffected. This mirrors fetchBalanceViaRpc: an
 * enrichment that degrades silently, never a dependency.
 */

const TALENT_SCORE_URL = "https://api.talentprotocol.com/score";
const REQUEST_TIMEOUT_MS = 12_000;
/** Builder Score moves slowly; a 6h in-memory TTL spares the API across scans. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Per-instance L1 cache: address (lowercased) -> { score, expires }. */
const cache = new Map<string, { score: number; expires: number }>();

/** Log the "no key" notice once per process, not on every scan. */
let warnedNoKey = false;

/** Test-only hook to clear the module cache between cases. */
export function __resetTalentCache(): void {
  cache.clear();
}

/**
 * Extract the numeric Builder Score from a Talent API response body. Tolerant of
 * the value arriving as a number or a numeric string; anything missing, negative,
 * or non-numeric collapses to 0. Pure.
 */
export function parseTalentScore(body: unknown): number {
  if (typeof body !== "object" || body === null) return 0;
  const score = (body as { score?: unknown }).score;
  if (typeof score !== "object" || score === null) return 0;
  const points = (score as { points?: unknown }).points;
  const n = typeof points === "number" ? points : Number(points);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Fetch the Talent Builder Score for a wallet. Returns the numeric score (0 when
 * absent / no key / any error). Never throws. Cached per-instance for 6h.
 */
export async function fetchTalentBuilderScore(
  address: string,
  signal: AbortSignal | undefined,
): Promise<number> {
  const key = process.env.TALENT_API_KEY;
  if (!key) {
    if (!warnedNoKey) {
      console.warn(
        "[talent] TALENT_API_KEY not set; Builder Score quest falls back to its onchain signal.",
      );
      warnedNoKey = true;
    }
    return 0;
  }

  const addr = address.toLowerCase();
  const hit = cache.get(addr);
  if (hit && hit.expires > Date.now()) return hit.score;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const url = `${TALENT_SCORE_URL}?id=${encodeURIComponent(addr)}&account_source=wallet`;
    const res = await fetch(url, {
      headers: { "X-API-KEY": key, accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return 0;
    const score = parseTalentScore(await res.json());
    cache.set(addr, { score, expires: Date.now() + CACHE_TTL_MS });
    return score;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

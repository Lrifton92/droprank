/**
 * Percentile of a DropRank score among checked wallets.
 *
 * Live source: an Upstash Redis sorted-set (score -> member). We ZADD every
 * computed score and read how many wallets scored strictly below.
 *
 * The store is best-effort: if Upstash is unconfigured, errors, or holds too
 * few wallets to be meaningful, we fall back to a static embedded curve so the
 * API NEVER fails because of the store (edge-cache fallback pattern).
 */

import { Redis } from "@upstash/redis";
import { SCORE_MAX } from "./scoring";

/** Below this many tracked wallets a live percentile is noise -> use static. */
const MIN_POPULATION = 30;

/**
 * v2: the score barème changed (docs/wallet-score-v2-spec.md), so v2 scores must
 * not mix with v1 in the distribution. The store is a per-address sorted-set
 * (ZADD overwrites a re-scanned address), but addresses never re-scanned would
 * keep their v1 score and skew the percentile during the transition. A fresh key
 * starts the v2 population clean; the v1 set is left untouched (no migration).
 */
const ZSET_KEY = "droprank:scores:v2";

/**
 * Compute a percentile from raw sorted-set counts.
 * @param below number of wallets scored strictly below this score
 * @param total total wallets in the set
 * @returns percentile in [0,99], or null if the population is too small to trust
 */
export function percentileFromCounts(below: number, total: number): number | null {
  if (total < MIN_POPULATION) return null;
  const pct = Math.round((below / total) * 100);
  return Math.max(0, Math.min(99, pct));
}

/**
 * Static fallback curve: an embedded, monotonically-increasing CDF mapping a
 * score to the share of farmers it beats. Calibrated to be plausible for Base
 * (most checked wallets are light farmers; high scores are rare). Bounded to 99.
 */
const STATIC_CURVE: ReadonlyArray<[minScore: number, percentile: number]> = [
  [0, 0],
  [5, 8],
  [10, 18],
  [20, 33],
  [30, 47],
  [40, 60],
  [50, 71],
  [60, 80],
  [70, 88],
  [80, 93],
  [90, 97],
  [100, 99],
];

export function staticPercentile(score: number): number {
  const s = Math.max(0, Math.min(SCORE_MAX, score));
  let p = 0;
  for (const [min, pct] of STATIC_CURVE) {
    if (s >= min) p = pct;
    else break;
  }
  return p;
}

let redis: Redis | null | undefined;

/** Lazily build the Redis client from env, once. null when unconfigured. */
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

/**
 * Record a score and return its percentile among checked wallets.
 * Always resolves (never throws): on any store failure it returns the static
 * fallback so the caller's response is unaffected.
 */
export async function recordAndRankScore(
  address: string,
  score: number,
): Promise<number> {
  const client = getRedis();
  if (!client) return staticPercentile(score);

  try {
    // One member per wallet; ZADD overwrites the prior score on refresh.
    await client.zadd(ZSET_KEY, { score, member: address.toLowerCase() });
    const [below, total] = await Promise.all([
      score > 0 ? client.zcount(ZSET_KEY, 0, score - 1) : Promise.resolve(0),
      client.zcard(ZSET_KEY),
    ]);
    const live = percentileFromCounts(below, total);
    return live ?? staticPercentile(score);
  } catch {
    return staticPercentile(score);
  }
}

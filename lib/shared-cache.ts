/**
 * Two-tier cache for the JSON API routes (score / quests / news / discover).
 *
 * Why: the per-instance LruCache (lib/cache.ts) resets on every serverless cold
 * start, so on Vercel it barely caches anything — users keep paying the full
 * compute cost (on-chain scan, 7-feed RSS fan-out, translation). This adds a
 * shared L2 in Upstash Redis so a result computed by ANY instance is reused by
 * the others until its TTL expires.
 *
 * Tier order on a request:
 *   L1 (LruCache) hit            -> return it (fastest, same instance)
 *   L2 (Redis GET, JSON) hit     -> return it + warm L1
 *   miss                         -> compute, SET Redis (TTL) + L1, return
 *
 * Project rule (matches lib/percentile.ts / lib/cache.ts rate-limiter): the API
 * MUST NEVER fail because of the store. Every Redis call is wrapped so any error
 * (or unconfigured Upstash) silently degrades to "compute now" — Redis is a
 * speed-up, never a dependency.
 */

import { Redis } from "@upstash/redis";
import { LruCache } from "./cache";

let redis: Redis | null | undefined;

/** Lazily build the Redis client from env, once. null when unconfigured. */
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

/** Namespaced Redis key so cache entries can't collide with other features. */
function redisKey(key: string): string {
  return `droprank:cache:${key}`;
}

/**
 * Resolve `key` through L1 -> L2 -> `compute`, populating both tiers on a miss.
 *
 * @param l1 the route's in-memory LruCache (its own TTL governs L1 freshness).
 * @param key cache key, unique per result (callers fold lang/address into it).
 * @param ttlSeconds L2 (Redis) TTL. L1's TTL is whatever the LruCache was built with.
 * @param compute called only on a full miss; its result is cached in both tiers.
 *
 * Redis failures never propagate: a flaky/absent store degrades to recompute.
 */
export async function getOrSetCached<V>(
  l1: LruCache<V>,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<V>,
): Promise<V> {
  const hot = l1.get(key);
  if (hot !== undefined) return hot;

  const client = getRedis();
  if (client) {
    try {
      // @upstash/redis auto-deserializes JSON values written via `set`.
      const cached = await client.get<V>(redisKey(key));
      if (cached != null) {
        l1.set(key, cached);
        return cached;
      }
    } catch {
      // Ignore: treat as a miss and compute.
    }
  }

  const value = await compute();
  l1.set(key, value);

  if (client) {
    try {
      await client.set(redisKey(key), value, { ex: ttlSeconds });
    } catch {
      // Ignore: the value is already in L1 and was returned to the caller.
    }
  }
  return value;
}

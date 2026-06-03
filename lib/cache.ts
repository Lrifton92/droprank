/**
 * Minimal in-memory LRU + naive per-IP rate limiter. Sustffisant pour v1.
 * Per-instance only (resets on cold start). The real percentile store
 * (Upstash) comes later per the spec.
 */

interface Entry<V> {
  value: V;
  expires: number;
}

export class LruCache<V> {
  private map = new Map<string, Entry<V>>();
  constructor(
    private max = 500,
    private ttlMs = 5 * 60 * 1000,
  ) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

/** Naive fixed-window rate limiter, per key (IP). Returns true if allowed. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private limit = 30,
    private windowMs = 60_000,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const e = this.hits.get(key);
    if (!e || now > e.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (e.count >= this.limit) return false;
    e.count++;
    return true;
  }
}

/**
 * Trusted client IP for rate-limiting.
 *
 * `x-forwarded-for[0]` is client-controlled and trivially spoofable, so it must
 * NOT be used as a limiter key. On Vercel the platform sets `x-vercel-forwarded-for`
 * (the real client IP, injected by the edge — not forwardable by the client).
 * As a fallback we take the LAST hop of `x-forwarded-for`, which is the address
 * appended by the trusted proxy nearest us (earlier hops can be forged).
 */
export function clientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Distributed rate-limit check that works across serverless instances.
 *
 * Uses Upstash (sliding window) when UPSTASH_REDIS_REST_URL/TOKEN are set;
 * otherwise falls back to the per-instance in-memory limiter (better than nothing
 * in dev). NEVER throws: any store error fails OPEN (allow) so a flaky Redis can
 * never take a route down.
 *
 * @returns true if the request is allowed.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RlOpts {
  /** Stable name per route, used as the limiter key prefix. */
  prefix: string;
  /** Max requests per window. */
  limit: number;
  /** Window in seconds. */
  windowSeconds: number;
}

const upstashLimiters = new Map<string, Ratelimit>();
const memoryLimiters = new Map<string, RateLimiter>();
let upstashRedis: Redis | null | undefined;

function getUpstash(): Redis | null {
  if (upstashRedis !== undefined) return upstashRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  upstashRedis = url && token ? new Redis({ url, token }) : null;
  return upstashRedis;
}

export async function checkRateLimit(
  req: Request,
  opts: RlOpts,
): Promise<boolean> {
  const id = clientIp(req);
  const redis = getUpstash();

  if (redis) {
    try {
      let rl = upstashLimiters.get(opts.prefix);
      if (!rl) {
        rl = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(
            opts.limit,
            `${opts.windowSeconds} s`,
          ),
          prefix: `droprank:rl:${opts.prefix}`,
        });
        upstashLimiters.set(opts.prefix, rl);
      }
      const { success } = await rl.limit(id);
      return success;
    } catch {
      // Fail open: never let a Redis hiccup break the route.
      return true;
    }
  }

  // Dev / unconfigured: per-instance fallback.
  let mem = memoryLimiters.get(opts.prefix);
  if (!mem) {
    mem = new RateLimiter(opts.limit, opts.windowSeconds * 1000);
    memoryLimiters.set(opts.prefix, mem);
  }
  return mem.allow(id);
}

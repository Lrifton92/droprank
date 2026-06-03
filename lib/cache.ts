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

/** Best-effort client IP from request headers (Vercel/CF aware). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

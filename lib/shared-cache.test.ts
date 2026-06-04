import { describe, it, expect, vi, beforeEach } from "vitest";
import { LruCache } from "./cache";

// Map-backed Redis fake shared by every `new Redis()` — mirrors the real L2
// being a single store shared across all serverless routes.
const store = new Map<string, unknown>();
let failing = false;
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(k: string) {
      if (failing) throw new Error("redis down");
      return store.has(k) ? store.get(k) : null;
    }
    async set(k: string, v: unknown) {
      if (failing) throw new Error("redis down");
      store.set(k, v);
    }
  },
}));

// Env must exist before the module lazily builds its client on first use.
process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

import { getOrSetCached } from "./shared-cache";

beforeEach(() => {
  store.clear();
  failing = false;
});

describe("getOrSetCached namespaces", () => {
  it("never lets two namespaces collide on the same raw key (bug 2026-06-04: score/quests both keyed the bare address)", async () => {
    const addr = "0x1deeaec4250e66702e22777ec1e3a70b19745a72";
    // Fresh L1 per "route" AND per call below, so reads go through L2 (Redis).
    await getOrSetCached(new LruCache<object>(10), "score", addr, 60, async () => ({
      score: 76,
    }));
    await getOrSetCached(new LruCache<object>(10), "quests", addr, 60, async () => ({
      quests: [1, 2, 3],
    }));

    // L2 hits (computes would return sentinels — they must NOT run).
    const scoreBack = await getOrSetCached(
      new LruCache<object>(10), "score", addr, 60,
      async () => ({ wrong: true }),
    );
    const questsBack = await getOrSetCached(
      new LruCache<object>(10), "quests", addr, 60,
      async () => ({ wrong: true }),
    );
    expect(scoreBack).toEqual({ score: 76 });
    expect(questsBack).toEqual({ quests: [1, 2, 3] });
  });

  it("serves an L2 hit across instances without recomputing", async () => {
    const compute = vi.fn(async () => "value");
    await getOrSetCached(new LruCache<string>(10), "news", "fr", 60, compute);
    const again = await getOrSetCached(
      new LruCache<string>(10), "news", "fr", 60, compute,
    );
    expect(again).toBe("value");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("degrades to compute when Redis is down (never fails the request)", async () => {
    failing = true;
    const out = await getOrSetCached(
      new LruCache<string>(10), "score", "0xabc", 60,
      async () => "computed",
    );
    expect(out).toBe("computed");
  });
});

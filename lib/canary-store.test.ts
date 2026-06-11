import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Upstash before importing the module under test (same pattern as
// shared-cache.test.ts). A single in-memory store stands in for Redis.
const store = new Map<string, unknown>();

vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(k: string) {
      return store.has(k) ? store.get(k) : null;
    }
    async set(k: string, v: unknown) {
      store.set(k, v);
    }
  },
}));

process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

const ROUTERS_KEY = "droprank:canary:routers";

import { getExtraRouters, addExtraRouter } from "./canary-store";

beforeEach(() => store.clear());

describe("getExtraRouters shape validation (protects the prod detection path)", () => {
  it("returns well-formed string[] per quest as-is", async () => {
    store.set(ROUTERS_KEY, { "swap-pancakeswap": ["0xabc", "0xdef"] });
    expect(await getExtraRouters()).toEqual({
      "swap-pancakeswap": ["0xabc", "0xdef"],
    });
  });

  it("drops a non-array entry instead of feeding it to computeQuests", async () => {
    // A string here would make `extra.includes(a)` match by SUBSTRING; a number
    // would TypeError. Either must never reach detection.
    store.set(ROUTERS_KEY, { "swap-uniswap": "0xrouter", "swap-aerodrome": 42 });
    expect(await getExtraRouters()).toEqual({});
  });

  it("filters non-string items out of an otherwise-valid array", async () => {
    store.set(ROUTERS_KEY, { "swap-pancakeswap": ["0xabc", 1, null, "0xdef"] });
    expect(await getExtraRouters()).toEqual({
      "swap-pancakeswap": ["0xabc", "0xdef"],
    });
  });

  it("returns {} for a non-object root", async () => {
    store.set(ROUTERS_KEY, "not-an-object");
    expect(await getExtraRouters()).toEqual({});
  });

  it("returns {} when nothing is stored", async () => {
    expect(await getExtraRouters()).toEqual({});
  });
});

describe("addExtraRouter", () => {
  it("adds a lowercased address and is idempotent", async () => {
    expect(await addExtraRouter("swap-pancakeswap", "0xABC")).toBe(true);
    expect(await addExtraRouter("swap-pancakeswap", "0xabc")).toBe(false);
    expect(await getExtraRouters()).toEqual({ "swap-pancakeswap": ["0xabc"] });
  });

  it("keeps per-quest isolation when adding to different quests", async () => {
    await addExtraRouter("swap-pancakeswap", "0xaaa");
    await addExtraRouter("swap-uniswap", "0xbbb");
    expect(await getExtraRouters()).toEqual({
      "swap-pancakeswap": ["0xaaa"],
      "swap-uniswap": ["0xbbb"],
    });
  });
});

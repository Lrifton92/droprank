import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchTalentBuilderScore,
  parseTalentScore,
  __resetTalentCache,
} from "./talent";

const ADDR = "0xabc0000000000000000000000000000000000abc";
const KEY = "TALENT_TEST_KEY";

/** JSON success envelope. */
function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("parseTalentScore (pure)", () => {
  it("reads the documented score.points shape", () => {
    expect(parseTalentScore({ score: { points: 142 } })).toBe(142);
  });

  it("reads a numeric-string points value", () => {
    expect(parseTalentScore({ score: { points: "88" } })).toBe(88);
  });

  it("returns 0 for an absent/zero score", () => {
    expect(parseTalentScore({ score: { points: 0 } })).toBe(0);
    expect(parseTalentScore({})).toBe(0);
    expect(parseTalentScore(null)).toBe(0);
    expect(parseTalentScore({ score: {} })).toBe(0);
  });

  it("never returns a negative or NaN value", () => {
    expect(parseTalentScore({ score: { points: -5 } })).toBe(0);
    expect(parseTalentScore({ score: { points: "abc" } })).toBe(0);
  });
});

describe("fetchTalentBuilderScore", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const prevKey = process.env.TALENT_API_KEY;

  beforeEach(() => {
    process.env.TALENT_API_KEY = KEY;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    __resetTalentCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevKey === undefined) delete process.env.TALENT_API_KEY;
    else process.env.TALENT_API_KEY = prevKey;
  });

  it("returns the parsed score and sends the X-API-KEY header", async () => {
    fetchMock.mockResolvedValueOnce(ok({ score: { points: 142 } }));
    const score = await fetchTalentBuilderScore(ADDR, undefined);
    expect(score).toBe(142);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe(KEY);
  });

  it("returns 0 without throwing when no key is configured", async () => {
    delete process.env.TALENT_API_KEY;
    const score = await fetchTalentBuilderScore(ADDR, undefined);
    expect(score).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled(); // no key -> no network call
  });

  it("returns 0 without throwing on an HTTP error (e.g. 401)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    await expect(fetchTalentBuilderScore(ADDR, undefined)).resolves.toBe(0);
  });

  it("returns 0 without throwing on a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(fetchTalentBuilderScore(ADDR, undefined)).resolves.toBe(0);
  });
});

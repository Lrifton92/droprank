import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translateToFr, parseGoogleTranslate, __test } from "./translate";

// Google's real response shape (captured live 2026-06-04). Single segment.
const ONE_SEGMENT = [
  [
    [
      "Base lance une nouvelle fonctionnalité",
      "Base launches new feature",
      null,
      null,
      3,
    ],
  ],
  null,
  "en",
];

// Multi-segment response (one entry per sentence) — must be concatenated.
const MULTI_SEGMENT = [
  [
    ["Le Bitcoin a dépassé les 70 000 $. ", "Bitcoin surged past $70k. ", null, null, 3],
    ["Les analystes restent optimistes.", "Analysts remain bullish.", null, null, 3],
  ],
  null,
  "en",
];

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  __test.clearCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseGoogleTranslate", () => {
  it("extracts a single-segment translation", () => {
    expect(parseGoogleTranslate(ONE_SEGMENT)).toBe(
      "Base lance une nouvelle fonctionnalité",
    );
  });

  it("concatenates multi-segment translations", () => {
    expect(parseGoogleTranslate(MULTI_SEGMENT)).toBe(
      "Le Bitcoin a dépassé les 70 000 $. Les analystes restent optimistes.",
    );
  });

  it("returns null on unrecognized shapes", () => {
    expect(parseGoogleTranslate(null)).toBeNull();
    expect(parseGoogleTranslate("nope")).toBeNull();
    expect(parseGoogleTranslate([])).toBeNull();
    expect(parseGoogleTranslate([null])).toBeNull();
    expect(parseGoogleTranslate([[]])).toBeNull();
    expect(parseGoogleTranslate([[[123]]])).toBeNull(); // non-string segment
  });
});

describe("translateToFr", () => {
  it("translates each text, order-preserving", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(ONE_SEGMENT))
      .mockResolvedValueOnce(jsonResponse(MULTI_SEGMENT));
    vi.stubGlobal("fetch", fetchMock);

    const out = await translateToFr([
      "Base launches new feature",
      "Bitcoin surged past $70k. Analysts remain bullish.",
    ]);
    expect(out).toEqual([
      "Base lance une nouvelle fonctionnalité",
      "Le Bitcoin a dépassé les 70 000 $. Les analystes restent optimistes.",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches: a repeated text is not re-fetched on a second call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ONE_SEGMENT));
    vi.stubGlobal("fetch", fetchMock);

    await translateToFr(["Base launches new feature"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call, same text: served from cache, no new fetch.
    const out = await translateToFr(["Base launches new feature"]);
    expect(out).toEqual(["Base lance une nouvelle fonctionnalité"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("de-dupes identical texts within one batch (single fetch)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ONE_SEGMENT));
    vi.stubGlobal("fetch", fetchMock);

    const out = await translateToFr([
      "Base launches new feature",
      "Base launches new feature",
    ]);
    expect(out).toEqual([
      "Base lance une nouvelle fonctionnalité",
      "Base lance une nouvelle fonctionnalité",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the original on a network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const out = await translateToFr(["Base launches new feature"]);
    expect(out).toEqual(["Base launches new feature"]);
  });

  it("falls back to the original on a non-OK response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const out = await translateToFr(["Base launches new feature"]);
    expect(out).toEqual(["Base launches new feature"]);
  });

  it("falls back to the original on an invalid payload shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ garbage: true }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await translateToFr(["Base launches new feature"]);
    expect(out).toEqual(["Base launches new feature"]);
  });

  it("passes empty strings through without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const out = await translateToFr(["", ""]);
    expect(out).toEqual(["", ""]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

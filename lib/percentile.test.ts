import { describe, it, expect } from "vitest";
import { percentileFromCounts, staticPercentile } from "./percentile";

describe("percentileFromCounts", () => {
  it("returns 0 when nobody scores below", () => {
    expect(percentileFromCounts(0, 100)).toBe(0);
  });

  it("returns the share of wallets scored strictly below, rounded", () => {
    // 75 of 100 wallets are below -> top 25%, percentile 75.
    expect(percentileFromCounts(75, 100)).toBe(75);
  });

  it("caps at 99 so the very top still reads as a percentile, never 100", () => {
    // Everyone (incl. self counted) below -> still clamp to 99.
    expect(percentileFromCounts(100, 100)).toBe(99);
    expect(percentileFromCounts(120, 100)).toBe(99);
  });

  it("falls back to the static curve when the population is too small", () => {
    // total below the trust threshold -> caller should use static instead.
    expect(percentileFromCounts(5, 3)).toBeNull();
    expect(percentileFromCounts(0, 0)).toBeNull();
  });
});

describe("staticPercentile", () => {
  it("monotonically increases with score", () => {
    let prev = -1;
    for (let s = 0; s <= 100; s += 5) {
      const p = staticPercentile(s);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("returns 0 for a zero score", () => {
    expect(staticPercentile(0)).toBe(0);
  });

  it("never returns 100 (top is rare but bounded)", () => {
    expect(staticPercentile(100)).toBeLessThanOrEqual(99);
  });

  it("clamps out-of-range scores", () => {
    expect(staticPercentile(-10)).toBe(0);
    expect(staticPercentile(999)).toBe(staticPercentile(100));
  });
});

import { describe, it, expect } from "vitest";
import { estimateAllocation, ALLOCATION_THRESHOLD } from "./allocation";

describe("estimateAllocation", () => {
  it("returns no figure below the eligibility threshold", () => {
    for (const s of [0, 5, 19, ALLOCATION_THRESHOLD - 1]) {
      const e = estimateAllocation(s);
      expect(e.eligible).toBe(false);
      expect(e.low).toBe(0);
      expect(e.high).toBe(0);
    }
  });

  it("becomes eligible at the threshold", () => {
    expect(estimateAllocation(ALLOCATION_THRESHOLD).eligible).toBe(true);
  });

  it("keeps low < high (right-skewed range)", () => {
    for (let s = ALLOCATION_THRESHOLD; s <= 100; s += 1) {
      const e = estimateAllocation(s);
      expect(e.low).toBeLessThan(e.high);
    }
  });

  it("is non-decreasing in score", () => {
    let prevHigh = -1;
    let prevLow = -1;
    for (let s = ALLOCATION_THRESHOLD; s <= 100; s += 1) {
      const e = estimateAllocation(s);
      expect(e.high).toBeGreaterThanOrEqual(prevHigh);
      expect(e.low).toBeGreaterThanOrEqual(prevLow);
      prevHigh = e.high;
      prevLow = e.low;
    }
  });

  it("ignores the percentile argument (deterministic on score)", () => {
    const a = estimateAllocation(70, 1);
    const b = estimateAllocation(70, 99);
    const c = estimateAllocation(70);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it("rounds to clean steps (no precise-looking figures)", () => {
    const e = estimateAllocation(84);
    expect(e.low % 5).toBe(0);
    expect(e.high % 5).toBe(0);
  });

  it("matches the empirical anchors at the curve ends", () => {
    // score 100 -> midpoint $9,000 -> 0.7x / 1.4x, rounded to /50.
    expect(estimateAllocation(100)).toEqual({ low: 6300, high: 12600, eligible: true });
    // score 20 -> midpoint $250 -> 0.7x / 1.4x, rounded to /25.
    expect(estimateAllocation(20)).toEqual({ low: 175, high: 350, eligible: true });
  });
});

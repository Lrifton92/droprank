import { describe, it, expect } from "vitest";
import {
  estimateAllocation,
  ALLOCATION_THRESHOLD,
} from "./allocation";

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

  it("keeps low <= high", () => {
    for (let s = 0; s <= 100; s += 1) {
      const e = estimateAllocation(s, 50);
      expect(e.low).toBeLessThanOrEqual(e.high);
    }
  });

  it("is non-decreasing in score (no percentile)", () => {
    let prevHigh = -1;
    for (let s = ALLOCATION_THRESHOLD; s <= 100; s += 1) {
      const e = estimateAllocation(s);
      expect(e.high).toBeGreaterThanOrEqual(prevHigh);
      prevHigh = e.high;
    }
  });

  it("gives a rarer wallet (higher percentile) a bigger estimate at equal score", () => {
    const common = estimateAllocation(70, 60);
    const rare = estimateAllocation(70, 99);
    expect(rare.high).toBeGreaterThan(common.high);
    expect(rare.low).toBeGreaterThan(common.low);
  });

  it("rounds to clean steps (no precise-looking figures)", () => {
    const e = estimateAllocation(90, 97);
    expect(e.low % 5).toBe(0);
    expect(e.high % 5).toBe(0);
  });

  it("ignores a non-finite percentile gracefully", () => {
    const e = estimateAllocation(85, NaN);
    expect(e.eligible).toBe(true);
    expect(e.high).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { findCandidates, passesGate } from "./canary";

describe("findCandidates", () => {
  const A = "0xaaa0000000000000000000000000000000000001";
  const B = "0xbbb0000000000000000000000000000000000002";
  const KNOWN = "0xccc0000000000000000000000000000000000003";

  it("surfaces an unknown entrypoint that recurs at/above minCount", () => {
    const eps = [A, A, A, KNOWN, B];
    const out = findCandidates(eps, new Set([KNOWN]), 3);
    expect(out).toEqual([{ addr: A, count: 3 }]);
  });

  it("ignores entrypoints already known (base set ∪ KV extras)", () => {
    const eps = [KNOWN, KNOWN, KNOWN, KNOWN];
    expect(findCandidates(eps, new Set([KNOWN]), 2)).toEqual([]);
  });

  it("drops noise below the frequency threshold (one-off arb/aggregator)", () => {
    const eps = [A, B, KNOWN];
    expect(findCandidates(eps, new Set([KNOWN]), 2)).toEqual([]);
  });

  it("ranks candidates by frequency, most-used first", () => {
    const eps = [A, A, B, B, B];
    expect(findCandidates(eps, new Set(), 2)).toEqual([
      { addr: B, count: 3 },
      { addr: A, count: 2 },
    ]);
  });

  it("is case-insensitive and ignores empty/null entries", () => {
    const eps = [A.toUpperCase(), A, "", A];
    expect(findCandidates(eps, new Set(), 2)).toEqual([{ addr: A, count: 3 }]);
  });
});

describe("passesGate", () => {
  const SIGS = ["infinity-core", "infinity-periphery", "pancake"];

  it("passes a verified contract whose source references a protocol lib", () => {
    expect(
      passesGate(
        { isVerified: true, text: "lib/infinity-core/src/vault.sol aggregator" },
        SIGS,
      ),
    ).toBe(true);
  });

  it("rejects an unverified contract even if the text matches", () => {
    expect(
      passesGate({ isVerified: false, text: "pancakeswap router" }, SIGS),
    ).toBe(false);
  });

  it("rejects a verified contract with no protocol signature (e.g. a 1inch/Odos aggregator)", () => {
    expect(
      passesGate(
        { isVerified: true, text: "OneInch AggregationRouterV6 generic dex" },
        SIGS,
      ),
    ).toBe(false);
  });

  it("matches signatures case-insensitively", () => {
    expect(
      passesGate({ isVerified: true, text: "IMPORT INFINITY-CORE" }, SIGS),
    ).toBe(true);
  });
});

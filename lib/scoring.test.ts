import { describe, it, expect } from "vitest";
import { computeScore, SCORE_MAX } from "./scoring";
import type { Tx, WalletData } from "./types";

const DAY = 86400;
const ADDR = "0x1111111111111111111111111111111111111111";

function tx(over: Partial<Tx>): Tx {
  return {
    hash: "0x" + Math.random().toString(16).slice(2),
    from: ADDR,
    to: "0x2222222222222222222222222222222222222222",
    value: "0",
    timestamp: 1_700_000_000,
    ...over,
  };
}

function wallet(over: Partial<WalletData>): WalletData {
  return {
    address: ADDR,
    txs: [],
    txCount: 0,
    isContract: false,
    hasBasename: false,
    usedSmartWallet: false,
    ...over,
  };
}

describe("computeScore", () => {
  it("scores an empty wallet at 0", () => {
    const r = computeScore(wallet({}), 0);
    expect(r.score).toBe(0);
    expect(r.max).toBe(SCORE_MAX);
    expect(r.max).toBe(100);
  });

  it("never exceeds 100 even for a maxed-out wallet", () => {
    const now = 1_700_000_000;
    // 1000 txs spread over 18 months, 30 distinct contracts, 5 ETH volume.
    const txs: Tx[] = [];
    for (let i = 0; i < 1000; i++) {
      txs.push(
        tx({
          to: "0x" + (3000 + (i % 40)).toString(16).padStart(40, "0"),
          value: i < 10 ? "1000000000000000000" : "0", // 10 ETH total -> top volume tier
          timestamp: now - i * DAY,
          toIsContract: true,
        }),
      );
    }
    const r = computeScore(
      wallet({
        txs,
        txCount: 1000,
        hasBasename: true,
        usedSmartWallet: true,
      }),
      20, // full quest points
    );
    expect(r.score).toBe(100);
  });

  it("awards basename and smart wallet points only when present", () => {
    const base = wallet({ txCount: 1 });
    const none = computeScore(base, 0);
    const both = computeScore(
      wallet({ txCount: 1, hasBasename: true, usedSmartWallet: true }),
      0,
    );
    const get = (r: ReturnType<typeof computeScore>, k: string) =>
      r.breakdown.find((b) => b.key === k)!.points;
    expect(get(none, "basename")).toBe(0);
    expect(get(none, "smartWallet")).toBe(0);
    expect(get(both, "basename")).toBe(5);
    expect(get(both, "smartWallet")).toBe(5);
  });

  it("counts distinct active days and months from timestamps", () => {
    const now = 1_700_000_000;
    const txs = [
      tx({ timestamp: now }),
      tx({ timestamp: now + 3600 }), // same day
      tx({ timestamp: now + 3 * DAY }), // +3 days, same month
      tx({ timestamp: now + 40 * DAY }), // next month
    ];
    const r = computeScore(wallet({ txs, txCount: txs.length }), 0);
    const days = r.breakdown.find((b) => b.key === "activeDays")!;
    const months = r.breakdown.find((b) => b.key === "activeMonths")!;
    expect(days.detail).toContain("3"); // 3 distinct days
    expect(months.detail).toContain("2"); // 2 distinct months
  });

  it("counts unique contracts touched (only contract recipients)", () => {
    const txs = [
      tx({ to: "0xaaa0000000000000000000000000000000000001", toIsContract: true }),
      tx({ to: "0xaaa0000000000000000000000000000000000001", toIsContract: true }),
      tx({ to: "0xaaa0000000000000000000000000000000000002", toIsContract: true }),
      tx({ to: "0xeoa0000000000000000000000000000000000003", toIsContract: false }),
    ];
    const r = computeScore(wallet({ txs, txCount: txs.length }), 0);
    const contracts = r.breakdown.find((b) => b.key === "uniqueContracts")!;
    expect(contracts.detail).toContain("2");
  });

  it("uses on-chain txCount for the tx-tier criterion, not txs.length", () => {
    // 3000 txs fetched but on-chain count is higher -> tier uses the real count.
    const r = computeScore(wallet({ txs: [], txCount: 5000 }), 0);
    const txTier = r.breakdown.find((b) => b.key === "txCount")!;
    expect(txTier.points).toBe(txTier.max); // top tier
  });

  it("clamps quest points into [0, 20]", () => {
    const over = computeScore(wallet({ txCount: 1 }), 999);
    const q = over.breakdown.find((b) => b.key === "quests")!;
    expect(q.points).toBe(20);
    const neg = computeScore(wallet({ txCount: 1 }), -5);
    expect(neg.breakdown.find((b) => b.key === "quests")!.points).toBe(0);
  });

  it("score equals the sum of its breakdown points", () => {
    const now = 1_700_000_000;
    const txs = [
      tx({ value: "500000000000000000", timestamp: now, toIsContract: true }),
      tx({ value: "500000000000000000", timestamp: now - 100 * DAY, toIsContract: true, to: "0xbbb0000000000000000000000000000000000001" }),
    ];
    const r = computeScore(
      wallet({ txs, txCount: 50, hasBasename: true }),
      8,
    );
    const sum = r.breakdown.reduce((s, b) => s + b.points, 0);
    expect(r.score).toBe(sum);
  });
});

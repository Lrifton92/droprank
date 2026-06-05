import { describe, it, expect } from "vitest";
import { computeScore, SCORE_MAX, MAX } from "./scoring";
import type { Tx, WalletData, ScoreExtra, ProtocolCategory } from "./types";

const DAY = 86400;
const ADDR = "0x1111111111111111111111111111111111111111";
const ETH = (n: number) => BigInt(Math.round(n * 1e6)).toString() + "000000000000";

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

function extra(over: Partial<ScoreExtra>): ScoreExtra {
  return { categoriesTouched: [], bridgeDone: false, ...over };
}

const pts = (r: ReturnType<typeof computeScore>, k: string) =>
  r.breakdown.find((b) => b.key === k)?.points;

const NOW = Math.floor(Date.now() / 1000);
const contractAt = (i: number) =>
  "0x" + (0xc0000 + i).toString(16).padStart(40, "0");

/**
 * Synthesize a tx list with EXACT distinct-day / distinct-month / contract /
 * volume targets. The first tx is anchored `spanDays` ago (drives wallet age).
 *
 * Determinism trick: the `activeDays` distinct UTC days are spread uniformly but
 * CONFINED to the first `months` calendar months after firstTs — so the distinct
 * month count is exactly `months` regardless of today's calendar alignment. The
 * span used by the spread metric is then ~(months·~30d), slightly < spanDays;
 * wallet age stays `spanDays` (now − firstTs).
 */
function synthWallet(opts: {
  txCount: number;
  activeDays: number;
  months: number;
  spanDays: number;
  contracts: number;
  volumeEth: number;
}): Tx[] {
  const firstTs = NOW - opts.spanDays * DAY;
  const first = new Date(firstTs * 1000);
  // Exclusive end = first day of (firstMonth + months); confine days before it.
  const endExclusive =
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + opts.months, 1) / 1000;
  const windowDays = Math.max(1, Math.floor((endExclusive - firstTs) / DAY) - 1);
  const nContracts = Math.max(opts.contracts, 1);
  const txs: Tx[] = [];

  for (let d = 0; d < opts.activeDays; d++) {
    const frac = opts.activeDays === 1 ? 0 : d / (opts.activeDays - 1);
    const ts = firstTs + Math.round(frac * windowDays) * DAY;
    txs.push(
      tx({ to: contractAt(d % nContracts), toIsContract: true, timestamp: ts }),
    );
  }
  // Pad to the distinct-contract target (extra contracts on the first day).
  for (let c = opts.activeDays; ; c++) {
    const distinct = new Set(
      txs.filter((t) => t.toIsContract && t.to).map((t) => t.to!.toLowerCase()),
    ).size;
    if (distinct >= opts.contracts) break;
    txs.push(tx({ to: contractAt(c), toIsContract: true, timestamp: firstTs }));
  }
  // Volume on a single non-dust tx (on the first day, doesn't add a month/day).
  if (opts.volumeEth > 0) {
    txs.push(tx({ value: ETH(opts.volumeEth), timestamp: firstTs }));
  }
  return txs;
}

describe("computeScore — barème basics", () => {
  it("scores an empty wallet at 0", () => {
    const r = computeScore(wallet({}), 0);
    expect(r.score).toBe(0);
    expect(r.max).toBe(SCORE_MAX);
    expect(r.max).toBe(100);
  });

  it("MAX criteria sum to 100", () => {
    const total = Object.values(MAX).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });

  it("reaches exactly 100 when every criterion is maxed", () => {
    // 220 distinct days over a ~425d/14-month window -> spread ~0.52 -> tier 8.
    const txs = synthWallet({
      txCount: 220,
      activeDays: 220,
      months: 14,
      spanDays: 430,
      contracts: 30,
      volumeEth: 12,
    });
    const r = computeScore(
      wallet({ txs, txCount: 220, hasBasename: true, usedSmartWallet: true }),
      20,
      extra({
        categoriesTouched: ["DEX", "Lending", "Perps", "Identity", "NFT"],
        bridgeDone: true,
        balanceWei: ETH(1),
      }),
    );
    expect(pts(r, "activitySpread")).toBe(8);
    expect(r.score).toBe(100);
  });

  it("regroups identity (Basename 4 + Smart Wallet 4) additively", () => {
    const none = computeScore(wallet({ txCount: 1 }), 0);
    const base = computeScore(wallet({ txCount: 1, hasBasename: true }), 0);
    const both = computeScore(
      wallet({ txCount: 1, hasBasename: true, usedSmartWallet: true }),
      0,
    );
    expect(pts(none, "identity")).toBe(0);
    expect(pts(base, "identity")).toBe(4);
    expect(pts(both, "identity")).toBe(8);
  });

  it("uses on-chain txCount for the tx tier, not txs.length", () => {
    const r = computeScore(wallet({ txs: [], txCount: 5000 }), 0);
    expect(pts(r, "txCount")).toBe(MAX.txCount); // 5000 >= 100 -> top
  });

  it("clamps quest points into [0, 20]", () => {
    const over = computeScore(wallet({ txCount: 1 }), 999);
    expect(pts(over, "quests")).toBe(20);
    const neg = computeScore(wallet({ txCount: 1 }), -5);
    expect(pts(neg, "quests")).toBe(0);
  });

  it("score equals gross sum minus any malus", () => {
    const txs = synthWallet({
      txCount: 50,
      activeDays: 20,
      months: 4,
      spanDays: 120,
      contracts: 6,
      volumeEth: 1,
    });
    const r = computeScore(
      wallet({ txs, txCount: 50, hasBasename: true }),
      8,
      extra({ categoriesTouched: ["DEX", "Lending"], bridgeDone: true }),
    );
    const gross = r.breakdown
      .filter((b) => b.key !== "sybilFlags")
      .reduce((s, b) => s + b.points, 0);
    const malus = r.breakdown.find((b) => b.key === "sybilFlags");
    expect(r.score).toBe(gross + (malus ? malus.points : 0));
  });
});

describe("computeScore — Arbitrum tx tiers (spec §5)", () => {
  const cases: Array<[count: number, expected: number]> = [
    [0, 0],
    [1, 2],
    [4, 5],
    [10, 8],
    [25, 11],
    [100, 14],
    [180, 14],
  ];
  for (const [count, expected] of cases) {
    it(`${count} tx -> ${expected}`, () => {
      const r = computeScore(wallet({ txCount: count }), 0);
      expect(pts(r, "txCount")).toBe(expected);
    });
  }
});

describe("computeScore — active months tiers (spec §5)", () => {
  const cases: Array<[months: number, expected: number]> = [
    [1, 2],
    [2, 4],
    [3, 7],
    [6, 11],
    [9, 15],
    [12, 18],
    [14, 18],
  ];
  for (const [months, expected] of cases) {
    it(`${months} months -> ${expected}`, () => {
      // one tx per distinct month, far apart so months count exactly.
      const txs = Array.from({ length: months }, (_, m) =>
        tx({ timestamp: NOW - m * 31 * DAY }),
      );
      const r = computeScore(wallet({ txs, txCount: txs.length }), 0);
      expect(pts(r, "activeMonths")).toBe(expected);
    });
  }
});

describe("computeScore — dust de-weighting (spec M3)", () => {
  it("excludes sub-0.0003 ETH txs from the volume sum", () => {
    const txs = [
      tx({ value: ETH(0.0001), timestamp: NOW }), // dust, excluded
      tx({ value: ETH(0.0002), timestamp: NOW }), // dust, excluded
    ];
    const r = computeScore(wallet({ txs, txCount: 2 }), 0);
    expect(pts(r, "volumeEth")).toBe(0); // 0 counted volume
  });

  it("keeps txs at/above the dust threshold", () => {
    const txs = [tx({ value: ETH(1), timestamp: NOW })];
    const r = computeScore(wallet({ txs, txCount: 1 }), 0);
    expect(pts(r, "volumeEth")).toBe(6); // 1 ETH -> 6
  });
});

describe("computeScore — spec §6 worked examples", () => {
  it("Example A — organic farmer -> 83", () => {
    const txs = synthWallet({
      txCount: 180,
      activeDays: 95,
      months: 11,
      spanDays: 330,
      contracts: 14,
      volumeEth: 2.4,
    });
    const r = computeScore(
      wallet({ txs, txCount: 180, hasBasename: true, usedSmartWallet: true }),
      16,
      extra({
        categoriesTouched: ["DEX", "Lending", "Perps", "Identity", "NFT"],
        bridgeDone: true,
        balanceWei: ETH(0.08),
      }),
    );
    expect(pts(r, "txCount")).toBe(14);
    expect(pts(r, "activeMonths")).toBe(15);
    expect(pts(r, "activitySpread")).toBe(4); // spread ~0.29 -> 4
    expect(pts(r, "volumeEth")).toBe(6);
    expect(pts(r, "uniqueContracts")).toBe(5);
    expect(pts(r, "protocolDiversity")).toBe(10); // 5 cat
    expect(pts(r, "bridge")).toBe(4);
    expect(pts(r, "identity")).toBe(8);
    expect(pts(r, "firstTxAge")).toBe(1); // 330 -> 1
    expect(pts(r, "quests")).toBe(16);
    expect(r.breakdown.find((b) => b.key === "sybilFlags")).toBeUndefined();
    expect(r.score).toBe(83);
  });

  it("Example B — sybil burst -> 15", () => {
    // 60 tx within a single day window (span < 2d, > 0 so spread caps at 1).
    const start = NOW - 1 * DAY;
    const txs = Array.from({ length: 60 }, (_, i) =>
      tx({
        to: contractAt(0), // single contract
        toIsContract: true,
        value: ETH(0.004 / 60),
        timestamp: start + Math.floor((i / 60) * 12 * 3600), // within ~12h
      }),
    );
    const r = computeScore(
      wallet({ txs, txCount: 60 }),
      1,
      extra({
        categoriesTouched: ["DEX"], // 1 category
        bridgeDone: false,
        balanceWei: ETH(0.002), // dust
      }),
    );
    expect(pts(r, "txCount")).toBe(11); // 60 >= 25
    expect(pts(r, "activeMonths")).toBe(2); // 1 month
    expect(pts(r, "activitySpread")).toBe(8); // span<1d, spread caps to 1 -> 8
    expect(pts(r, "volumeEth")).toBe(0); // 0.004 < 0.01
    expect(pts(r, "uniqueContracts")).toBe(1);
    expect(pts(r, "protocolDiversity")).toBe(2); // 1 cat
    expect(pts(r, "bridge")).toBe(0);
    expect(pts(r, "identity")).toBe(0);
    expect(pts(r, "firstTxAge")).toBe(0); // 1 day
    expect(pts(r, "quests")).toBe(1);
    const malus = r.breakdown.find((b) => b.key === "sybilFlags")!;
    expect(malus.points).toBe(-10); // burst -6 + dust -4, capped at -10
    expect(malus.detail).toBe("burst + dust");
    expect(r.score).toBe(15); // clamp(25 - 10)
  });

  it("Example C — old regular, low volume -> 61", () => {
    const txs = synthWallet({
      txCount: 40,
      activeDays: 38,
      months: 14,
      spanDays: 420,
      contracts: 6,
      volumeEth: 0.3,
    });
    const r = computeScore(
      wallet({ txs, txCount: 40, hasBasename: true }),
      9,
      extra({
        categoriesTouched: ["DEX", "Lending", "Identity"],
        bridgeDone: true,
        balanceWei: ETH(0.05),
      }),
    );
    expect(pts(r, "txCount")).toBe(11);
    expect(pts(r, "activeMonths")).toBe(18);
    expect(pts(r, "activitySpread")).toBe(2); // spread ~0.09 -> 2
    expect(pts(r, "volumeEth")).toBe(2);
    expect(pts(r, "uniqueContracts")).toBe(3);
    expect(pts(r, "protocolDiversity")).toBe(6); // 3 cat
    expect(pts(r, "bridge")).toBe(4);
    expect(pts(r, "identity")).toBe(4);
    expect(pts(r, "firstTxAge")).toBe(2); // 420 -> 2
    expect(pts(r, "quests")).toBe(9);
    expect(r.breakdown.find((b) => b.key === "sybilFlags")).toBeUndefined();
    expect(r.score).toBe(61);
  });
});

describe("computeScore — anti-sybil malus (spec §4.2 / §4.3)", () => {
  function burstTxs(count: number): Tx[] {
    const start = NOW - 1 * DAY;
    return Array.from({ length: count }, (_, i) =>
      tx({
        to: contractAt(0),
        toIsContract: true,
        timestamp: start + Math.floor((i / count) * 12 * 3600),
      }),
    );
  }

  it("applies the burst malus only when span<=2d AND txCount>=20", () => {
    const r = computeScore(
      wallet({ txs: burstTxs(30), txCount: 30 }),
      0,
      extra({ balanceWei: ETH(1) }), // not dust -> isolate burst
    );
    const malus = r.breakdown.find((b) => b.key === "sybilFlags")!;
    expect(malus.points).toBe(-6);
    expect(malus.detail).toBe("burst");
  });

  it("no burst malus for 19 txs (below the threshold)", () => {
    const r = computeScore(
      wallet({ txs: burstTxs(19), txCount: 19 }),
      0,
      extra({ balanceWei: ETH(1) }),
    );
    expect(r.breakdown.find((b) => b.key === "sybilFlags")).toBeUndefined();
  });

  it("applies the dust malus only when balance<0.005 AND contracts<=1", () => {
    const txs = [tx({ to: contractAt(0), toIsContract: true, timestamp: NOW })];
    const r = computeScore(
      wallet({ txs, txCount: 1 }),
      0,
      extra({ balanceWei: ETH(0.001) }),
    );
    const malus = r.breakdown.find((b) => b.key === "sybilFlags")!;
    expect(malus.points).toBe(-4);
    expect(malus.detail).toBe("dust");
  });

  it("no dust malus when 2+ contracts are touched", () => {
    const txs = [
      tx({ to: contractAt(0), toIsContract: true, timestamp: NOW }),
      tx({ to: contractAt(1), toIsContract: true, timestamp: NOW }),
    ];
    const r = computeScore(
      wallet({ txs, txCount: 2 }),
      0,
      extra({ balanceWei: ETH(0.001) }),
    );
    expect(r.breakdown.find((b) => b.key === "sybilFlags")).toBeUndefined();
  });

  it("never applies the dust malus when balance is unknown (RPC down, §4.3)", () => {
    const txs = [tx({ to: contractAt(0), toIsContract: true, timestamp: NOW })];
    // extra present but balanceWei undefined -> dust never fires.
    const r = computeScore(wallet({ txs, txCount: 1 }), 0, extra({}));
    expect(r.breakdown.find((b) => b.key === "sybilFlags")).toBeUndefined();
  });

  it("caps the combined malus at -10", () => {
    const txs = burstTxs(30).map((t) => ({ ...t, to: contractAt(0) }));
    const r = computeScore(
      wallet({ txs, txCount: 30 }),
      0,
      extra({ balanceWei: ETH(0.001) }), // dust + burst -> 6+4=10
    );
    expect(r.breakdown.find((b) => b.key === "sybilFlags")!.points).toBe(-10);
  });
});

describe("computeScore — degraded / edge inputs (spec §4.3)", () => {
  it("0 tx -> spread 0, age 0, no malus", () => {
    const r = computeScore(wallet({ txCount: 0 }), 0, extra({}));
    expect(pts(r, "activitySpread")).toBe(0);
    expect(pts(r, "firstTxAge")).toBe(0);
    expect(r.breakdown.find((b) => b.key === "sybilFlags")).toBeUndefined();
    expect(r.score).toBe(0);
  });

  it("single-day wallet (span 0) -> spread 0, no divide-by-zero", () => {
    const txs = [
      tx({ timestamp: NOW }),
      tx({ timestamp: NOW }), // same instant -> span 0
    ];
    const r = computeScore(wallet({ txs, txCount: 2 }), 0);
    expect(pts(r, "activitySpread")).toBe(0);
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it("perfect spread without burst: many days over a long span -> spread tier 8", () => {
    // 100 distinct days across exactly a 100-day span -> spread 1.0, span>2d (no burst).
    const txs = Array.from({ length: 100 }, (_, d) =>
      tx({ timestamp: NOW - (99 - d) * DAY, toIsContract: true, to: contractAt(d % 5) }),
    );
    const r = computeScore(wallet({ txs, txCount: 100 }), 0, extra({ balanceWei: ETH(1) }));
    expect(pts(r, "activitySpread")).toBe(8);
    expect(r.breakdown.find((b) => b.key === "sybilFlags")).toBeUndefined();
  });

  it("works with no extra arg at all (v1-shaped caller): diversity/bridge = 0", () => {
    const txs = synthWallet({
      txCount: 40,
      activeDays: 10,
      months: 4,
      spanDays: 120,
      contracts: 6,
      volumeEth: 1,
    });
    const r = computeScore(wallet({ txs, txCount: 40, hasBasename: true }), 9);
    expect(pts(r, "protocolDiversity")).toBe(0);
    expect(pts(r, "bridge")).toBe(0);
    // No balance read -> no dust malus.
    expect(r.breakdown.find((b) => b.key === "sybilFlags")).toBeUndefined();
  });

  it("handles txCount > txs.length (truncated scan) for the tx tier", () => {
    // few txs materialized but real on-chain count is high.
    const txs = synthWallet({
      txCount: 5,
      activeDays: 5,
      months: 2,
      spanDays: 60,
      contracts: 3,
      volumeEth: 0,
    });
    const r = computeScore(wallet({ txs, txCount: 1000 }), 0);
    expect(pts(r, "txCount")).toBe(14); // tier uses real txCount
  });

  it("dedupes categoriesTouched before tiering", () => {
    const dupes: ProtocolCategory[] = ["DEX", "DEX", "Lending"];
    const r = computeScore(wallet({ txCount: 1 }), 0, extra({ categoriesTouched: dupes }));
    expect(pts(r, "protocolDiversity")).toBe(4); // 2 distinct -> 4
  });
});

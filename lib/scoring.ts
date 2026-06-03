import type { WalletData, ScoreResult, ScoreBreakdownItem } from "./types";

/**
 * Pure scoring. computeScore is deterministic and side-effect free.
 *
 * Barème (from the spec, /100). Tier thresholds are documented constants below;
 * the spec fixes the MAX per criterion, the piecewise tiers are our calibration
 * for v1 (round, farmer-meaningful steps).
 */

export const SCORE_MAX = 100;

/** Max points per criterion (sums to 100). Fixed by the spec. */
export const MAX = {
  txCount: 20,
  activeMonths: 15,
  activeDays: 10,
  volumeEth: 10,
  uniqueContracts: 10,
  firstTxAge: 5,
  basename: 5,
  smartWallet: 5,
  quests: 20,
} as const;

/** Tx-count tiers -> points (cumulative thresholds, ascending). */
const TX_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [1000, 20],
  [500, 16],
  [200, 12],
  [100, 9],
  [50, 6],
  [20, 4],
  [5, 2],
  [1, 1],
];

/** Active-months tiers -> points. */
const MONTH_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [18, 15],
  [12, 12],
  [9, 10],
  [6, 7],
  [3, 4],
  [2, 2],
  [1, 1],
];

/** Active-days tiers -> points. */
const DAY_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [100, 10],
  [60, 8],
  [30, 6],
  [14, 4],
  [7, 2],
  [1, 1],
];

/** Cumulative ETH volume tiers -> points. */
const VOLUME_ETH_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [10, 10],
  [5, 8],
  [1, 6],
  [0.5, 4],
  [0.1, 2],
  [0.01, 1],
];

/** Unique contracts touched tiers -> points. */
const CONTRACT_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [30, 10],
  [20, 8],
  [10, 6],
  [5, 4],
  [2, 2],
  [1, 1],
];

/** First-tx age tiers (in days) -> points. */
const AGE_DAYS_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [365, 5],
  [270, 4],
  [180, 3],
  [90, 2],
  [30, 1],
];

const WEI_PER_ETH = BigInt("1000000000000000000");

function tier(value: number, tiers: ReadonlyArray<[number, number]>): number {
  for (const [min, points] of tiers) {
    if (value >= min) return points;
  }
  return 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** UTC day key (YYYY-MM-DD granularity, as integer days since epoch). */
function dayKey(tsSeconds: number): number {
  return Math.floor(tsSeconds / 86400);
}

/** UTC month key (year*12 + month). */
function monthKey(tsSeconds: number): number {
  const d = new Date(tsSeconds * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * @param data aggregated wallet data
 * @param questPoints points earned from the quest engine (0..MAX.quests)
 */
export function computeScore(data: WalletData, questPoints: number): ScoreResult {
  const { txs } = data;

  const days = new Set<number>();
  const months = new Set<number>();
  const contracts = new Set<string>();
  let volumeWei = BigInt(0);
  let earliest = Infinity;

  for (const t of txs) {
    days.add(dayKey(t.timestamp));
    months.add(monthKey(t.timestamp));
    if (t.toIsContract && t.to) contracts.add(t.to.toLowerCase());
    try {
      volumeWei += BigInt(t.value || "0");
    } catch {
      // Ignore malformed value strings; treat as 0 contribution.
    }
    if (t.timestamp < earliest) earliest = t.timestamp;
  }

  const volumeEth = Number(volumeWei) / Number(WEI_PER_ETH);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageDays =
    earliest === Infinity ? 0 : Math.floor((nowSeconds - earliest) / 86400);

  const breakdown: ScoreBreakdownItem[] = [
    {
      key: "txCount",
      label: "Transactions",
      points: tier(data.txCount, TX_TIERS),
      max: MAX.txCount,
      detail: `${data.txCount} tx`,
    },
    {
      key: "activeMonths",
      label: "Active months",
      points: tier(months.size, MONTH_TIERS),
      max: MAX.activeMonths,
      detail: `${months.size} months`,
    },
    {
      key: "activeDays",
      label: "Active days",
      points: tier(days.size, DAY_TIERS),
      max: MAX.activeDays,
      detail: `${days.size} days`,
    },
    {
      key: "volumeEth",
      label: "ETH volume",
      points: tier(volumeEth, VOLUME_ETH_TIERS),
      max: MAX.volumeEth,
      detail: `${volumeEth.toFixed(3)} ETH`,
    },
    {
      key: "uniqueContracts",
      label: "Contracts touched",
      points: tier(contracts.size, CONTRACT_TIERS),
      max: MAX.uniqueContracts,
      detail: `${contracts.size} contracts`,
    },
    {
      key: "firstTxAge",
      label: "Wallet age",
      points: tier(ageDays, AGE_DAYS_TIERS),
      max: MAX.firstTxAge,
      detail: ageDays > 0 ? `${ageDays} days` : "no tx",
    },
    {
      key: "basename",
      label: "Basename",
      points: data.hasBasename ? MAX.basename : 0,
      max: MAX.basename,
      detail: data.hasBasename ? "owned" : "none",
    },
    {
      key: "smartWallet",
      label: "Smart Wallet",
      points: data.usedSmartWallet ? MAX.smartWallet : 0,
      max: MAX.smartWallet,
      detail: data.usedSmartWallet ? "used" : "no",
    },
    {
      key: "quests",
      label: "Quests",
      points: clamp(Math.round(questPoints), 0, MAX.quests),
      max: MAX.quests,
      detail: `${clamp(Math.round(questPoints), 0, MAX.quests)}/${MAX.quests} pts`,
    },
  ];

  const score = breakdown.reduce((s, b) => s + b.points, 0);

  return {
    address: data.address,
    score: clamp(score, 0, SCORE_MAX),
    max: SCORE_MAX,
    breakdown,
  };
}

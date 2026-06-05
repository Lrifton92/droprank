import type { WalletData, ScoreResult, ScoreBreakdownItem, ScoreExtra } from "./types";

/**
 * Pure scoring v2. computeScore is deterministic and side-effect free.
 *
 * v2 barème (docs/wallet-score-v2-spec.md): every criterion is justified by a
 * published airdrop criterion (Arbitrum tiers, OP diversity overlap, LayerZero
 * dust de-weighting, Talent/Base identity). The headline change vs v1: temporal
 * QUALITY now matters — a regular wallet beats a same-volume burst via the
 * activity-spread bonus and an anti-sybil malus (burst 48h / dust mono-contract).
 *
 * The MAX per criterion is fixed by the spec §4.1 (sums to 100); the piecewise
 * tiers are the spec's §5 sourced calibration.
 */

export const SCORE_MAX = 100;

/** Max points per criterion (sums to 100). Fixed by spec §4.1. */
export const MAX = {
  txCount: 14,
  activeMonths: 18,
  activitySpread: 8,
  volumeEth: 10,
  uniqueContracts: 6,
  protocolDiversity: 10,
  bridge: 4,
  identity: 8,
  firstTxAge: 2,
  quests: 20,
} as const;

/** Tx-count tiers -> points (Arbitrum 4/10/25/100 + high extension). Spec §5. */
const TX_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [100, 14],
  [25, 11],
  [10, 8],
  [4, 5],
  [1, 2],
];

/** Active-months tiers -> points (Arbitrum 2/6/9 + extension). Spec §5. */
const MONTH_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [12, 18],
  [9, 15],
  [6, 11],
  [3, 7],
  [2, 4],
  [1, 2],
];

/** Activity-spread tiers -> points (regularity bonus). Spec §5. */
const SPREAD_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [0.5, 8],
  [0.3, 6],
  [0.15, 4],
  [0.05, 2],
  [0, 1], // any positive spread -> 1; exactly 0 handled below
];

/** Cumulative ETH volume tiers -> points (Arbitrum log paliers). Spec §5. */
const VOLUME_ETH_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [10, 10],
  [5, 8],
  [1, 6],
  [0.5, 4],
  [0.1, 2],
  [0.01, 1],
];

/** Unique contracts touched tiers -> points. Spec §5. */
const CONTRACT_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [25, 6],
  [10, 5],
  [5, 3],
  [2, 2],
  [1, 1],
];

/** Protocol-diversity tiers -> points (distinct families, of 7). Spec §5. */
const DIVERSITY_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [5, 10],
  [4, 8],
  [3, 6],
  [2, 4],
  [1, 2],
];

/** Wallet-age tiers (days) -> points. Spec §5. */
const AGE_DAYS_TIERS: ReadonlyArray<[min: number, points: number]> = [
  [365, 2],
  [90, 1],
];

const WEI_PER_ETH = BigInt("1000000000000000000");

/** Dust tx threshold (~$1 proxy, spec M3): per-tx value below this is excluded. */
const DUST_TX_WEI = BigInt("300000000000000"); // 0.0003 ETH

/** Dust balance threshold (Arbitrum, spec §4.2): below this counts toward malus. */
const DUST_BALANCE_WEI = BigInt("5000000000000000"); // 0.005 ETH

/** Anti-sybil malus (spec §4.2), each bounded; total capped at MALUS_CAP. */
const BURST_MALUS = 6;
const DUST_MALUS = 4;
const MALUS_CAP = 10;
const BURST_SPAN_DAYS = 2;
const BURST_MIN_TX = 20;

function tier(value: number, tiers: ReadonlyArray<[number, number]>): number {
  for (const [min, points] of tiers) {
    if (value >= min) return points;
  }
  return 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** UTC day key (integer days since epoch). */
function dayKey(tsSeconds: number): number {
  return Math.floor(tsSeconds / 86400);
}

/** UTC month key (year*12 + month). */
function monthKey(tsSeconds: number): number {
  const d = new Date(tsSeconds * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Activity-spread points: span 0 (≤1 day or single tx) yields 0, not a tier. */
function spreadPoints(spread: number, spanDays: number): number {
  if (spanDays <= 0 || spread <= 0) return 0;
  return tier(spread, SPREAD_TIERS);
}

/**
 * @param data aggregated wallet data
 * @param questPoints points earned from the quest engine (0..MAX.quests)
 * @param extra v2 signals derived by the data layer (diversity, bridge, balance).
 *   Optional: when absent, diversity/bridge score 0 and the dust malus never
 *   fires (graceful degradation, spec §4.3) — used by v1-shaped callers/tests.
 */
export function computeScore(
  data: WalletData,
  questPoints: number,
  extra?: ScoreExtra,
): ScoreResult {
  const { txs } = data;

  const days = new Set<number>();
  const months = new Set<number>();
  const contracts = new Set<string>();
  let volumeWei = BigInt(0);
  let earliest = Infinity;
  let latest = -Infinity;

  for (const t of txs) {
    days.add(dayKey(t.timestamp));
    months.add(monthKey(t.timestamp));
    if (t.toIsContract && t.to) contracts.add(t.to.toLowerCase());
    try {
      const v = BigInt(t.value || "0");
      // Dust de-weighting (spec M3 / LayerZero): tx below ~$1 excluded from volume.
      if (v >= DUST_TX_WEI) volumeWei += v;
    } catch {
      // Ignore malformed value strings; treat as 0 contribution.
    }
    if (t.timestamp < earliest) earliest = t.timestamp;
    if (t.timestamp > latest) latest = t.timestamp;
  }

  const volumeEth = Number(volumeWei) / Number(WEI_PER_ETH);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageDays =
    earliest === Infinity ? 0 : Math.floor((nowSeconds - earliest) / 86400);

  // Activity spread (spec M2): activeDays / span. spanDays<=0 -> spread 0.
  const spanDays =
    earliest === Infinity || latest === earliest
      ? 0
      : (latest - earliest) / 86400;
  const spread = spanDays > 0 ? clamp(days.size / spanDays, 0, 1) : 0;

  const categories = extra?.categoriesTouched ?? [];
  const distinctCategories = new Set(categories).size;
  const bridgeDone = extra?.bridgeDone === true;

  const identityPoints =
    (data.hasBasename ? 4 : 0) + (data.usedSmartWallet ? 4 : 0);

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
      key: "activitySpread",
      label: "Activity spread",
      points: spreadPoints(spread, spanDays),
      max: MAX.activitySpread,
      detail: `${spread.toFixed(2)} spread`,
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
      key: "protocolDiversity",
      label: "Protocol diversity",
      points: tier(distinctCategories, DIVERSITY_TIERS),
      max: MAX.protocolDiversity,
      detail: `${distinctCategories} categories`,
    },
    {
      key: "bridge",
      label: "Bridge",
      points: bridgeDone ? MAX.bridge : 0,
      max: MAX.bridge,
      detail: bridgeDone ? "bridged" : "no bridge",
    },
    {
      key: "identity",
      label: "Identity",
      points: identityPoints,
      max: MAX.identity,
      detail: identityDetail(data.hasBasename, data.usedSmartWallet),
    },
    {
      key: "firstTxAge",
      label: "Wallet age",
      points: tier(ageDays, AGE_DAYS_TIERS),
      max: MAX.firstTxAge,
      detail: ageDays > 0 ? `${ageDays} days` : "no tx",
    },
    {
      key: "quests",
      label: "Quests",
      points: clamp(Math.round(questPoints), 0, MAX.quests),
      max: MAX.quests,
      detail: `${clamp(Math.round(questPoints), 0, MAX.quests)}/${MAX.quests} pts`,
    },
  ];

  const gross = breakdown.reduce((s, b) => s + b.points, 0);

  // Anti-sybil malus (spec §4.2), applied after the sum, floor 0.
  const burst = spanDays <= BURST_SPAN_DAYS && data.txCount >= BURST_MIN_TX;
  // Dust malus only when balance was actually read (spec §4.3: don't invent it).
  const dust =
    contracts.size <= 1 && balanceBelow(extra?.balanceWei, DUST_BALANCE_WEI);

  const malus = Math.min(
    (burst ? BURST_MALUS : 0) + (dust ? DUST_MALUS : 0),
    MALUS_CAP,
  );

  if (malus > 0) {
    breakdown.push({
      key: "sybilFlags",
      label: "Sybil flags",
      points: -malus,
      max: 0,
      detail: sybilDetail(burst, dust),
    });
  }

  const score = clamp(gross - malus, 0, SCORE_MAX);

  return {
    address: data.address,
    score,
    max: SCORE_MAX,
    breakdown,
  };
}

/** True when a readable balance string parses below the threshold. */
function balanceBelow(balanceWei: string | undefined, thresholdWei: bigint): boolean {
  if (balanceWei === undefined) return false; // not read -> never dust (spec §4.3)
  try {
    return BigInt(balanceWei) < thresholdWei;
  } catch {
    return false;
  }
}

function identityDetail(hasBasename: boolean, usedSmartWallet: boolean): string {
  if (hasBasename && usedSmartWallet) return "basename + smart wallet";
  if (hasBasename) return "basename";
  if (usedSmartWallet) return "smart wallet";
  return "none";
}

function sybilDetail(burst: boolean, dust: boolean): string {
  const flags: string[] = [];
  if (burst) flags.push("burst");
  if (dust) flags.push("dust");
  return flags.join(" + ");
}

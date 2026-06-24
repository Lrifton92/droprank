/**
 * Speculative Base airdrop allocation estimate.
 *
 * IMPORTANT: Base has NO confirmed airdrop. This is a heuristic, derived purely
 * from the DropRank /100 score and the wallet's percentile rank — never a Base
 * figure, never a promise. The UI MUST label it speculative (no confirmed drop).
 *
 * Model: a USD band per score tier, loosely calibrated on published per-wallet
 * payouts of comparable L2 airdrops (Arbitrum / Optimism / Starknet tiers, where
 * most wallets landed in the low-hundreds and rare power-users in the low-thousands).
 * The percentile then nudges the band ±15%: a rarer wallet at the same score sits
 * higher in its band. Below the eligibility threshold we return no figure rather
 * than invent one.
 */

/** A speculative USD allocation range. `eligible: false` -> below threshold, low/high 0. */
export interface AllocationEstimate {
  low: number;
  high: number;
  eligible: boolean;
}

/** Score below which a drop is unlikely -> no figure shown. */
export const ALLOCATION_THRESHOLD = 20;

/** [minScore, lowUsd, highUsd], sorted by minScore desc. First match wins. */
const BANDS: ReadonlyArray<readonly [min: number, low: number, high: number]> = [
  [85, 1300, 3200],
  [75, 750, 1700],
  [60, 380, 900],
  [50, 180, 450],
  [35, 80, 220],
  [20, 25, 90],
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Round to a clean step so the figure reads as an estimate, not a precise quote. */
function roundNice(n: number): number {
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 25) * 25;
  return Math.round(n / 50) * 50;
}

/**
 * Estimate a speculative allocation from the score and (optional) percentile.
 * @param score DropRank score in [0,100].
 * @param percentile share of wallets scored BELOW this one (0..99), as stored
 *   by the percentile engine. Higher = rarer wallet. When absent, the band's
 *   nominal range is returned unscaled.
 */
export function estimateAllocation(
  score: number,
  percentile?: number,
): AllocationEstimate {
  if (!Number.isFinite(score) || score < ALLOCATION_THRESHOLD) {
    return { low: 0, high: 0, eligible: false };
  }

  let low = 25;
  let high = 90;
  for (const [min, bandLow, bandHigh] of BANDS) {
    if (score >= min) {
      low = bandLow;
      high = bandHigh;
      break;
    }
  }

  if (typeof percentile === "number" && Number.isFinite(percentile)) {
    // percentile = share of wallets scored BELOW this one, so higher = rarer.
    // Maps to a 0.85..1.15 factor: a rarer wallet sits higher in its band.
    const p = clamp(percentile, 0, 100);
    const factor = 0.85 + 0.3 * (p / 100);
    low *= factor;
    high *= factor;
  }

  return { low: roundNice(low), high: roundNice(high), eligible: true };
}

/**
 * Speculative Base airdrop allocation estimate, calibrated on REAL data.
 *
 * IMPORTANT: Base has no confirmed airdrop. As of Sept 2025 its team said it is
 * "exploring a native token" (Jesse Pollak, BaseCamp) but published no supply,
 * pool, or formula. So no Base figure can be scraped — none exists. The honest
 * maximum is to model what COMPARABLE L2 airdrops actually paid per wallet and
 * place a DropRank wallet on that empirical distribution by its score.
 *
 * Empirical per-wallet payouts used to calibrate the score→USD curve below
 * (value in USD at each airdrop's claim window):
 *   - Arbitrum (Mar 2023): 1.162B ARB / 11.62% supply / 625,143 wallets.
 *       min 625 ARB (~$750) · median 1,250 ARB (~$1,500) · max 10,250 ARB (~$12,300).
 *   - Optimism A1 (May 2022): 215M OP / 248,699 wallets. 409–27,535 OP, avg ~862.
 *   - Starknet (Feb 2024): 700M STRK / ~1.3M wallets. 500–10,000+ STRK, avg ~538 (~$1,000).
 *   - zkSync (Jun 2024): 3.675B ZK / 17.5% supply / 695,232 wallets. 917 ZK floor (~$600), 100k cap.
 *
 * Blend: an active wallet typically landed in the low-hundreds to low-thousands
 * USD; power users reached $10k+. The anchors below trace that distribution. The
 * range is right-skewed (×0.7 / ×1.4) like real airdrop payouts. The figure is
 * driven by the SCORE only (deterministic); the percentile is intentionally not
 * used — it diverges between cache reads and would make the headline unstable.
 */

/** A speculative USD allocation range. `eligible: false` -> below threshold, low/high 0. */
export interface AllocationEstimate {
  low: number;
  high: number;
  eligible: boolean;
}

/** Score below which a wallet sits under the typical sybil/eligibility cut -> no figure. */
export const ALLOCATION_THRESHOLD = 20;

/**
 * [score, midpointUsd] anchors tracing the blended empirical per-wallet payout
 * of the airdrops above. Monotonically increasing; interpolated linearly.
 *   20 → ~$250  (just eligible, low tier)
 *   40 → ~$600  (light farmer)
 *   60 → ~$1,200 (median active — ARB median ≈ $1,500, STRK avg ≈ $1,000)
 *   75 → ~$2,400 (strong farmer)
 *   85 → ~$4,500 (top tier)
 *  100 → ~$9,000 (power user — ARB max ≈ $12,300)
 */
const ANCHORS: ReadonlyArray<readonly [score: number, usd: number]> = [
  [20, 250],
  [40, 600],
  [60, 1200],
  [75, 2400],
  [85, 4500],
  [100, 9000],
];

/** Right-skew of real airdrop payouts: range is midpoint ×LOW .. ×HIGH. */
const SKEW_LOW = 0.7;
const SKEW_HIGH = 1.4;

/** Linear-interpolate the empirical midpoint (USD) for a score on the anchor curve. */
function midpointUsd(score: number): number {
  const first = ANCHORS[0];
  const last = ANCHORS[ANCHORS.length - 1];
  if (score <= first[0]) return first[1];
  if (score >= last[0]) return last[1];
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [s0, u0] = ANCHORS[i];
    const [s1, u1] = ANCHORS[i + 1];
    if (score >= s0 && score <= s1) {
      const f = (score - s0) / (s1 - s0);
      return u0 + (u1 - u0) * f;
    }
  }
  return last[1];
}

/** Round to a clean step so the figure reads as an estimate, not a precise quote. */
function roundNice(n: number): number {
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 25) * 25;
  return Math.round(n / 50) * 50;
}

/**
 * Estimate a speculative allocation from the DropRank score.
 * @param score DropRank score in [0,100].
 * @param _percentile accepted for call-site compatibility; intentionally unused
 *   (see file header — it diverges between cache reads and destabilises the figure).
 */
export function estimateAllocation(
  score: number,
  _percentile?: number,
): AllocationEstimate {
  if (!Number.isFinite(score) || score < ALLOCATION_THRESHOLD) {
    return { low: 0, high: 0, eligible: false };
  }
  const mid = midpointUsd(score);
  return {
    low: roundNice(mid * SKEW_LOW),
    high: roundNice(mid * SKEW_HIGH),
    eligible: true,
  };
}

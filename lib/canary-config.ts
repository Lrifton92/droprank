/**
 * Per-protocol canary configuration: which quest, which STABLE anchor pools to
 * sample swaps from, which library signatures prove a candidate is the
 * protocol's own contract, and the hardcoded base allowlist it augments.
 *
 * Only the migration-prone DEX/router quests are covered — the ones whose
 * detection anchors on a periphery entrypoint the protocol can swap out. The
 * other 15 quests anchor on stable cores or mechanism signals (mint = transfer
 * from 0x0, USDC token address, pool/market contracts) and don't need this.
 *
 * Safe by construction: an empty/wrong anchor yields no candidates (same as
 * today), never a bad add — the verification gate is what authorizes a write.
 */

import {
  AERODROME_ROUTERS,
  UNISWAP_ROUTERS,
  PANCAKESWAP_ROUTERS,
  PENDLE_ROUTER_V4,
} from "./contracts-registry";

export interface CanaryProtocol {
  /** Quest whose extraRouters this feeds (must match a QUESTS id). */
  questId: string;
  /** Human label for logs/audit. */
  label: string;
  /**
   * Lowercased addresses of stable, high-volume pools to sample recent swaps
   * from. Pools never migrate, so they're a permanent vantage point on which
   * routers the protocol's UI currently dispatches through.
   */
  anchorPools: string[];
  /**
   * Lowercased substrings that must appear in a candidate's verified source
   * (name + code + imported file paths) for it to be adopted. Use the protocol's
   * unique library LINEAGE (import paths / scoped packages), never the bare brand
   * name: a bare brand word is trivially spoofable (an attacker deploys a
   * verified contract with "pancakeswap" in a comment, routes one swap through
   * the anchor pool, and gets adopted — a 1-point cosmetic but real false add).
   * Lineage paths raise the bar materially. The gate is still text-on-attacker-
   * controlled-source so not unspoofable, but the trivial path is closed.
   */
  libSignatures: string[];
  /** The hardcoded allowlist this protocol's discoveries extend. */
  baseRouters: ReadonlySet<string>;
}

export const CANARY_PROTOCOLS: CanaryProtocol[] = [
  {
    // PancakeSwap Infinity routes the pancakeswap.finance UI through an
    // "Aggregator" whose source imports infinity-core/infinity-periphery. Anchor
    // = a live PancakeV3Pool (0x4D9d9913…) — the real swap 0xb51c4d98… cleared
    // through it. E2E-verified: the Aggregator surfaces here and passes the gate.
    questId: "swap-pancakeswap",
    label: "PancakeSwap",
    anchorPools: ["0x4d9d9913d33dd7ed6e472f07c6ad4a5bdd9cc495"],
    // Infinity lineage (E2E-verified on the real Aggregator) + the scoped npm
    // import path used by PancakeSwap's own periphery — not the bare brand word.
    libSignatures: ["infinity-core", "infinity-periphery", "@pancakeswap/"],
    baseRouters: PANCAKESWAP_ROUTERS,
  },
  {
    // Anchors: the flagship Base UniswapV3Pool WETH/USDC pairs (verified live).
    questId: "swap-uniswap",
    label: "Uniswap",
    anchorPools: [
      "0xd0b53d9277642d899df5c87a3966a349a798f224",
      "0x6c561b446416e1a00e8e93e221854d6ea4171372",
    ],
    libSignatures: ["v4-periphery", "v4-core", "universal-router", "@uniswap/"],
    baseRouters: UNISWAP_ROUTERS,
  },
  {
    // Anchors: Aerodrome "Volatile AMM" flagship pools (verified live).
    questId: "swap-aerodrome",
    label: "Aerodrome",
    anchorPools: [
      "0xcdac0d6c6c59727a65f871236188350531885c43", // WETH/USDC
      "0x2223f9fe624f69da4d8256a7bcc9104fba7f8f75", // AERO/USDbC
    ],
    libSignatures: ["aerodrome", "velodrome"],
    baseRouters: AERODROME_ROUTERS,
  },
  {
    // Anchor: a live PendleMarketV3 on Base. NOTE: Pendle markets have a maturity
    // and rotate — when this one expires its volume goes to zero and discovery
    // silently stops (degrades safely). Re-point to a fresh market periodically.
    questId: "yield-pendle",
    label: "Pendle",
    anchorPools: ["0x727cebacfb10ffd353fc221d06a862b437ec1735"],
    libSignatures: ["pendle"],
    baseRouters: new Set([PENDLE_ROUTER_V4]),
  },
];

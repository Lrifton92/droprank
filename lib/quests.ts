import type { Tx, QuestsResult, QuestResult, ProtocolCategory } from "./types";
import {
  AERODROME_ROUTER,
  UNISWAP_ROUTERS,
  MOONWELL_CONTRACTS,
  AAVE_V3_POOL,
  BASENAMES_CONTROLLERS,
  L2_STANDARD_BRIDGE,
  USDC_NATIVE,
  MORPHO_BLUE,
  COMPOUND_V3_USDC,
  PENDLE_ROUTER_V4,
  AVANTIS_TRADING,
  EXTRA_FINANCE_LENDING_POOL,
  PANCAKESWAP_SMART_ROUTER,
  SEAPORT_1_6,
  TALENT_CONTRACTS,
} from "./contracts-registry";

/**
 * Quest engine. Each quest is a pure predicate over the wallet's tx list.
 *
 * Scoring model (v2): the radar is a MENU, not a checklist. The raw sum of all
 * quest points exceeds QUESTS_MAX_POINTS (20) on purpose — adding protocols
 * creates more PATHS to max out the "Quests" scoring criterion rather than
 * inflating its cap. `earned` is clamped to QUESTS_MAX_POINTS so a wallet that
 * touches >20 pts worth of quests still reports 20/20 (and scoring.ts re-clamps
 * defensively on its side). This keeps earned <= total and pct <= 100% in the UI.
 *
 * Detection note: we match on `tx.to` against verified Base contract addresses
 * (see contracts-registry.ts). This is the keyless Blockscout-only signal.
 * Known limitation: canonical bridge DEPOSITS (L1->Base) don't appear as L2 txs,
 * so the bridge quest only catches L2 bridge interactions (documented in registry).
 */

export const QUESTS_MAX_POINTS = 20;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Extra signals computed by the data layer, passed alongside the tx list. */
export interface QuestContext {
  /** The checked address is itself a Coinbase Smart Wallet (factory-deployed). */
  isSmartWallet?: boolean;
}

interface QuestDef {
  id: string;
  label: string;
  points: number;
  /** How to complete it (shown in the UI as a direct link/hint). */
  link?: string;
  /**
   * Protocol family, for the v2 diversity metric (scoring.ts M4). Quests without
   * a family (token transfer, contract deploy, an activity-count milestone) are
   * left undefined and don't contribute to diversity.
   */
  category?: ProtocolCategory;
  check: (txs: Tx[], address: string, ctx: QuestContext) => boolean;
}

const to = (t: Tx) => (t.to ? t.to.toLowerCase() : null);

export const QUESTS: ReadonlyArray<QuestDef> = [
  {
    id: "swap-aerodrome",
    label: "Swap on Aerodrome",
    points: 2,
    link: "https://aerodrome.finance",
    category: "DEX",
    check: (txs) => txs.some((t) => to(t) === AERODROME_ROUTER),
  },
  {
    id: "swap-uniswap",
    label: "Swap on Uniswap (Base)",
    points: 2,
    link: "https://app.uniswap.org",
    category: "DEX",
    check: (txs) => txs.some((t) => { const a = to(t); return a !== null && UNISWAP_ROUTERS.has(a); }),
  },
  {
    id: "lend-moonwell",
    label: "Lend / borrow on Moonwell",
    points: 2,
    link: "https://moonwell.fi",
    category: "Lending",
    check: (txs) => txs.some((t) => { const a = to(t); return a !== null && MOONWELL_CONTRACTS.has(a); }),
  },
  {
    id: "supply-aave",
    label: "Supply on Aave v3 (Base)",
    points: 2,
    link: "https://app.aave.com",
    category: "Lending",
    check: (txs) => txs.some((t) => to(t) === AAVE_V3_POOL),
  },
  {
    id: "mint-nft",
    label: "Mint any NFT",
    points: 1,
    category: "NFT",
    check: (txs) =>
      txs.some(
        (t) =>
          t.toIsContract === true &&
          typeof t.method === "string" &&
          t.method.toLowerCase().includes("mint"),
      ),
  },
  {
    id: "basename",
    label: "Register a Basename",
    points: 2,
    link: "https://base.org/names",
    category: "Identity",
    check: (txs) => txs.some((t) => { const a = to(t); return a !== null && BASENAMES_CONTROLLERS.has(a); }),
  },
  {
    id: "smart-wallet",
    label: "Use a Smart Wallet",
    points: 2,
    link: "https://www.smartwallet.dev",
    category: "Identity",
    check: (_txs, _address, ctx) => ctx.isSmartWallet === true,
  },
  {
    id: "bridge-canonical",
    label: "Use the canonical Base bridge",
    points: 2,
    link: "https://bridge.base.org",
    category: "Bridge",
    check: (txs) => txs.some((t) => to(t) === L2_STANDARD_BRIDGE),
  },
  {
    id: "deploy-contract",
    label: "Deploy a contract",
    points: 2,
    check: (txs) => txs.some((t) => t.createsContract === true || t.to === null),
  },
  {
    id: "active-30-days",
    label: "Active on 30+ distinct days",
    points: 1,
    check: (txs) => {
      const days = new Set(txs.map((t) => Math.floor(t.timestamp / 86400)));
      return days.size >= 30;
    },
  },
  {
    id: "hold-usdc",
    label: "Interact with native USDC",
    points: 1,
    link: "https://www.base.org",
    check: (txs) => txs.some((t) => to(t) === USDC_NATIVE),
  },
  // --- Radar v2: additional Base protocols (more paths to the 20-pt cap) ---
  {
    id: "lend-morpho",
    label: "Lend / borrow on Morpho",
    points: 2,
    link: "https://app.morpho.org",
    category: "Lending",
    check: (txs) => txs.some((t) => to(t) === MORPHO_BLUE),
  },
  {
    id: "lend-compound",
    label: "Supply on Compound v3",
    points: 2,
    link: "https://app.compound.finance",
    category: "Lending",
    check: (txs) => txs.some((t) => to(t) === COMPOUND_V3_USDC),
  },
  {
    id: "yield-pendle",
    label: "Trade yield on Pendle",
    points: 2,
    link: "https://app.pendle.finance",
    category: "Lending",
    check: (txs) => txs.some((t) => to(t) === PENDLE_ROUTER_V4),
  },
  {
    id: "perps-avantis",
    label: "Trade perps on Avantis",
    points: 2,
    link: "https://www.avantisfi.com",
    category: "Perps",
    check: (txs) => txs.some((t) => to(t) === AVANTIS_TRADING),
  },
  {
    id: "leverage-extra",
    label: "Leverage farm on Extra Finance",
    points: 1,
    link: "https://app.extrafi.io",
    category: "Lending",
    check: (txs) => txs.some((t) => to(t) === EXTRA_FINANCE_LENDING_POOL),
  },
  {
    id: "swap-pancakeswap",
    label: "Swap on PancakeSwap (Base)",
    points: 1,
    link: "https://pancakeswap.finance",
    category: "DEX",
    check: (txs) => txs.some((t) => to(t) === PANCAKESWAP_SMART_ROUTER),
  },
  {
    id: "trade-opensea",
    label: "Trade an NFT on OpenSea",
    points: 1,
    link: "https://opensea.io",
    category: "NFT",
    check: (txs) => txs.some((t) => to(t) === SEAPORT_1_6),
  },
  {
    id: "talent-builder-score",
    label: "Create a Talent Builder Score",
    points: 2,
    link: "https://talent.app",
    category: "Social",
    check: (txs) => txs.some((t) => { const a = to(t); return a !== null && TALENT_CONTRACTS.has(a); }),
  },
];

export function computeQuests(
  txs: Tx[],
  address: string,
  ctx: QuestContext = {},
): QuestsResult {
  const quests: QuestResult[] = QUESTS.map((q) => {
    const done = q.check(txs, address, ctx);
    // category flows to the API payload so the radar UI never needs its own
    // quest→category map (drift risk: a quest added here would silently miss
    // its tag there).
    return { id: q.id, label: q.label, points: q.points, done, link: q.link, category: q.category };
  });

  const rawEarned = quests.reduce((s, q) => s + (q.done ? q.points : 0), 0);
  // Clamp: the radar offers >20 pts of paths, but the criterion caps at 20.
  const earned = clamp(rawEarned, 0, QUESTS_MAX_POINTS);

  // Distinct protocol families among completed quests (v2 diversity metric).
  const categories = new Set<ProtocolCategory>();
  for (const def of QUESTS) {
    if (def.category && quests.find((q) => q.id === def.id)!.done) {
      categories.add(def.category);
    }
  }

  return {
    address,
    total: QUESTS_MAX_POINTS,
    earned,
    quests,
    categoriesTouched: [...categories],
  };
}

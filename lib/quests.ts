import type { Tx, QuestsResult, QuestResult, ProtocolCategory } from "./types";
import {
  AERODROME_ROUTERS,
  UNISWAP_ROUTERS,
  MOONWELL_CONTRACTS,
  AAVE_CONTRACTS,
  BASENAMES_CONTROLLERS,
  BRIDGE_CONTRACTS,
  USDC_NATIVE,
  MORPHO_CONTRACTS,
  COMPOUND_CONTRACTS,
  PENDLE_ROUTER_V4,
  AVANTIS_TRADING,
  EXTRA_FINANCE_CONTRACTS,
  PANCAKESWAP_ROUTERS,
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
 * Bridge detection (limitation lifted 2026-06-06): the bridge quest now matches
 * (a) a NORMAL tx to any known bridge (canonical L2 bridge withdrawal, Socket/
 * Bungee aggregator), AND (b) an INBOUND fill delivered as an internal tx — a
 * canonical deposit finalization or an Across SpokePool fill (from = bridge,
 * value > 0). The data layer surfaces (b) via ctx.inboundBridge.
 */

export const QUESTS_MAX_POINTS = 20;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Extra signals computed by the data layer, passed alongside the tx list. */
export interface QuestContext {
  /** The checked address is itself a Coinbase Smart Wallet (factory-deployed). */
  isSmartWallet?: boolean;
  /**
   * The wallet received an inbound bridge fill delivered as an internal tx
   * (from a known bridge contract, value > 0): a canonical deposit finalization
   * or an Across SpokePool fill. Derived by the data layer from txlistinternal.
   */
  inboundBridge?: boolean;
  /**
   * Lowercased `to` addresses of the wallet's OUTGOING internal txs (from = the
   * wallet). For 4337 smart wallets the user's protocol calls are dispatched by
   * an entrypoint/account contract, so the protocol target shows up as an internal
   * call out of the wallet rather than a normal tx `to`. Folded into every
   * protocol-Set check so a smart-wallet swap/lend counts. Derived from
   * txlistinternal; absent when that pass was skipped/failed (never breaks a scan).
   */
  internalOutTo?: string[];
  /**
   * The wallet received native USDC as an inbound ERC-20 transfer (token = USDC).
   * Lets hold-usdc validate on a passive receipt, not only a direct USDC tx.
   * Derived from the token-transfer pass; absent when it was skipped/failed.
   */
  receivedUsdc?: boolean;
  /**
   * The wallet was the recipient of an ERC-721/1155 transfer FROM the zero address
   * (a mint), independent of the method name. Makes mint-nft robust and identical
   * across the quests and score data paths. Derived from the token-transfer pass.
   */
  mintedNft?: boolean;
  /**
   * Talent Protocol Builder Score signal for the wallet (> 0 means the wallet
   * created a Builder Score, even if currently expired). Read KEYLESS onchain on
   * Base via lib/providers/talent.ts (PassportBuilderScore.getLastUpdateByAddress);
   * on any RPC error this is 0 and the quest falls back to the onchain
   * TALENT_CONTRACTS tx signal.
   */
  talentBuilderScore?: number;
  /**
   * The wallet OWNS a .base.eth Basename (balanceOf > 0 on the BaseRegistrar
   * ERC-721). Read keyless onchain via lib/providers/basename.ts. This is the
   * truthful "has a Basename" signal: it catches holders who received one by
   * transfer, or whose registration tx is older than the scan window — neither
   * shows a controller tx. On any RPC error this is false and the quest falls
   * back to the registration-tx signal (touched BASENAMES_CONTROLLERS).
   */
  ownsBasename?: boolean;
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

/**
 * True when the wallet touched any contract in `set` — as a NORMAL tx `to`, or as
 * an OUTGOING internal-tx `to` (ctx.internalOutTo). The internal leg is what makes
 * a 4337 smart-wallet interaction count, where the protocol call is dispatched
 * internally rather than as a top-level tx the user signed (FIX A). Pure.
 */
function touched(set: ReadonlySet<string>, txs: Tx[], ctx: QuestContext): boolean {
  for (const t of txs) {
    const a = to(t);
    if (a !== null && set.has(a)) return true;
  }
  const internal = ctx.internalOutTo;
  if (internal) {
    for (const a of internal) {
      if (set.has(a)) return true;
    }
  }
  return false;
}

/** Single-address variant of {@link touched} (one known contract, not a Set). */
function touchedOne(addr: string, txs: Tx[], ctx: QuestContext): boolean {
  if (txs.some((t) => to(t) === addr)) return true;
  return ctx.internalOutTo?.includes(addr) === true;
}

export const QUESTS: ReadonlyArray<QuestDef> = [
  {
    id: "swap-aerodrome",
    label: "Swap on Aerodrome",
    points: 2,
    link: "https://aerodrome.finance",
    category: "DEX",
    check: (txs, _a, ctx) => touched(AERODROME_ROUTERS, txs, ctx),
  },
  {
    id: "swap-uniswap",
    label: "Swap on Uniswap (Base)",
    points: 2,
    link: "https://app.uniswap.org",
    category: "DEX",
    check: (txs, _a, ctx) => touched(UNISWAP_ROUTERS, txs, ctx),
  },
  {
    id: "lend-moonwell",
    label: "Lend / borrow on Moonwell",
    points: 2,
    link: "https://moonwell.fi",
    category: "Lending",
    check: (txs, _a, ctx) => touched(MOONWELL_CONTRACTS, txs, ctx),
  },
  {
    id: "supply-aave",
    label: "Supply on Aave v3 (Base)",
    points: 2,
    link: "https://app.aave.com",
    category: "Lending",
    check: (txs, _a, ctx) => touched(AAVE_CONTRACTS, txs, ctx),
  },
  {
    id: "mint-nft",
    label: "Mint any NFT",
    points: 1,
    category: "NFT",
    // Robust detection (FIX D/E): an ERC-721/1155 transfer FROM the zero address
    // to the wallet (ctx.mintedNft) is a mint regardless of the method name, so
    // the quests and score data paths agree. Kept as OR with the legacy method
    // heuristic for sources without the token-transfer pass.
    check: (txs, _a, ctx) =>
      ctx.mintedNft === true ||
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
    // Truthful ownership (owns the .base.eth NFT) OR a registration tx. Ownership
    // catches holders who received one or registered before the scan window.
    check: (txs, _a, ctx) =>
      ctx.ownsBasename === true || touched(BASENAMES_CONTROLLERS, txs, ctx),
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
    label: "Bridge to or from Base",
    points: 2,
    link: "https://bridge.base.org",
    category: "Bridge",
    check: (txs, _address, ctx) =>
      ctx.inboundBridge === true ||
      txs.some((t) => { const a = to(t); return a !== null && BRIDGE_CONTRACTS.has(a); }),
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
    // A direct USDC tx, OR a passive inbound USDC receipt (FIX D, ctx.receivedUsdc).
    check: (txs, _a, ctx) =>
      ctx.receivedUsdc === true || touchedOne(USDC_NATIVE, txs, ctx),
  },
  // --- Radar v2: additional Base protocols (more paths to the 20-pt cap) ---
  {
    id: "lend-morpho",
    label: "Lend / borrow on Morpho",
    points: 2,
    link: "https://app.morpho.org",
    category: "Lending",
    check: (txs, _a, ctx) => touched(MORPHO_CONTRACTS, txs, ctx),
  },
  {
    id: "lend-compound",
    label: "Supply on Compound v3",
    points: 2,
    link: "https://app.compound.finance",
    category: "Lending",
    check: (txs, _a, ctx) => touched(COMPOUND_CONTRACTS, txs, ctx),
  },
  {
    id: "yield-pendle",
    label: "Trade yield on Pendle",
    points: 2,
    link: "https://app.pendle.finance",
    category: "Lending",
    check: (txs, _a, ctx) => touchedOne(PENDLE_ROUTER_V4, txs, ctx),
  },
  {
    id: "perps-avantis",
    label: "Trade perps on Avantis",
    points: 2,
    link: "https://www.avantisfi.com",
    category: "Perps",
    check: (txs, _a, ctx) => touchedOne(AVANTIS_TRADING, txs, ctx),
  },
  {
    id: "leverage-extra",
    label: "Leverage farm on Extra Finance",
    points: 1,
    link: "https://app.extrafi.io",
    category: "Lending",
    check: (txs, _a, ctx) => touched(EXTRA_FINANCE_CONTRACTS, txs, ctx),
  },
  {
    id: "swap-pancakeswap",
    label: "Swap on PancakeSwap (Base)",
    points: 1,
    link: "https://pancakeswap.finance",
    category: "DEX",
    check: (txs, _a, ctx) => touched(PANCAKESWAP_ROUTERS, txs, ctx),
  },
  {
    id: "trade-opensea",
    label: "Trade an NFT on OpenSea",
    points: 1,
    link: "https://opensea.io",
    category: "NFT",
    check: (txs, _a, ctx) => touchedOne(SEAPORT_1_6, txs, ctx),
  },
  {
    id: "talent-builder-score",
    label: "Create a Talent Builder Score",
    points: 2,
    link: "https://talent.app",
    category: "Social",
    // The keyless onchain Builder Score signal (ctx.talentBuilderScore > 0 = the
    // wallet created a Builder Score), OR the PassportRegistry/Score tx
    // interaction (also reached via internal calls for smart wallets).
    check: (txs, _a, ctx) =>
      (typeof ctx.talentBuilderScore === "number" && ctx.talentBuilderScore > 0) ||
      touched(TALENT_CONTRACTS, txs, ctx),
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

import type { Tx, QuestsResult, QuestResult } from "./types";
import {
  AERODROME_ROUTER,
  UNISWAP_ROUTERS,
  MOONWELL_CONTRACTS,
  AAVE_V3_POOL,
  ZORA_1155_FACTORY,
  BASENAMES_CONTROLLERS,
  L2_STANDARD_BRIDGE,
  USDC_NATIVE,
} from "./contracts-registry";

/**
 * Quest engine. Each quest is a pure predicate over the wallet's tx list.
 * Points sum to QUESTS_MAX_POINTS (20) so a fully-completed radar feeds the
 * "Quests" scoring criterion at its max.
 *
 * Detection note: we match on `tx.to` against verified Base contract addresses
 * (see contracts-registry.ts). This is the keyless Blockscout-only signal for v1.
 * Known limitation: canonical bridge DEPOSITS (L1->Base) don't appear as L2 txs,
 * so the bridge quest only catches L2 bridge interactions (documented in registry).
 */

export const QUESTS_MAX_POINTS = 20;

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
  check: (txs: Tx[], address: string, ctx: QuestContext) => boolean;
}

const to = (t: Tx) => (t.to ? t.to.toLowerCase() : null);

export const QUESTS: ReadonlyArray<QuestDef> = [
  {
    id: "swap-aerodrome",
    label: "Swap on Aerodrome",
    points: 2,
    link: "https://aerodrome.finance",
    check: (txs) => txs.some((t) => to(t) === AERODROME_ROUTER),
  },
  {
    id: "swap-uniswap",
    label: "Swap on Uniswap (Base)",
    points: 2,
    link: "https://app.uniswap.org",
    check: (txs) => txs.some((t) => { const a = to(t); return a !== null && UNISWAP_ROUTERS.has(a); }),
  },
  {
    id: "lend-moonwell",
    label: "Lend / borrow on Moonwell",
    points: 2,
    link: "https://moonwell.fi",
    check: (txs) => txs.some((t) => { const a = to(t); return a !== null && MOONWELL_CONTRACTS.has(a); }),
  },
  {
    id: "supply-aave",
    label: "Supply on Aave v3 (Base)",
    points: 2,
    link: "https://app.aave.com",
    check: (txs) => txs.some((t) => to(t) === AAVE_V3_POOL),
  },
  {
    id: "mint-nft",
    label: "Mint any NFT",
    points: 1,
    check: (txs) =>
      txs.some(
        (t) =>
          t.toIsContract === true &&
          typeof t.method === "string" &&
          t.method.toLowerCase().includes("mint"),
      ),
  },
  {
    id: "mint-zora",
    label: "Mint on Zora",
    points: 1,
    link: "https://zora.co",
    check: (txs) => txs.some((t) => to(t) === ZORA_1155_FACTORY),
  },
  {
    id: "basename",
    label: "Register a Basename",
    points: 2,
    link: "https://base.org/names",
    check: (txs) => txs.some((t) => { const a = to(t); return a !== null && BASENAMES_CONTROLLERS.has(a); }),
  },
  {
    id: "smart-wallet",
    label: "Use a Smart Wallet",
    points: 2,
    link: "https://www.smartwallet.dev",
    check: (_txs, _address, ctx) => ctx.isSmartWallet === true,
  },
  {
    id: "bridge-canonical",
    label: "Use the canonical Base bridge",
    points: 2,
    link: "https://bridge.base.org",
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
];

export function computeQuests(
  txs: Tx[],
  address: string,
  ctx: QuestContext = {},
): QuestsResult {
  const quests: QuestResult[] = QUESTS.map((q) => {
    const done = q.check(txs, address, ctx);
    return { id: q.id, label: q.label, points: q.points, done };
  });

  const earned = quests.reduce((s, q) => s + (q.done ? q.points : 0), 0);

  return {
    address,
    total: QUESTS_MAX_POINTS,
    earned,
    quests,
  };
}

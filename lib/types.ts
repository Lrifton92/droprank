/** Shared types for the DropRank data layer. */

/** A single transaction as we need it for scoring/quests. Subset of Blockscout's tx shape. */
export interface Tx {
  /** Tx hash (lowercase). */
  hash: string;
  /** Sender address (lowercase). */
  from: string;
  /** Recipient address (lowercase). Null for contract-creation txs. */
  to: string | null;
  /** Value in wei (decimal string). */
  value: string;
  /** Unix timestamp in seconds. */
  timestamp: number;
  /** Method/function called, if decoded (lowercase). */
  method?: string | null;
  /** True if `to` is a contract (has code). */
  toIsContract?: boolean;
  /** True if this tx created a contract (no `to`). */
  createsContract?: boolean;
}

/** Aggregated wallet data fed to the pure scoring function. */
export interface WalletData {
  address: string;
  txs: Tx[];
  /** Total tx count from the chain (may exceed txs.length when capped). */
  txCount: number;
  /** True if the address itself is a smart contract / smart wallet. */
  isContract: boolean;
  /** True if the wallet owns a Basename (reverse resolution). */
  hasBasename: boolean;
  /** True if the wallet used a Coinbase Smart Wallet (factory detection). */
  usedSmartWallet: boolean;
  /**
   * True if the wallet received an inbound bridge fill via an internal tx (from a
   * known bridge contract, value > 0): a canonical deposit finalization or an
   * Across SpokePool fill. Feeds the bridge quest (ctx.inboundBridge). Optional:
   * absent when the internal-tx pass was skipped/failed (never breaks the scan).
   */
  inboundBridge?: boolean;
  /**
   * Live ETH balance in wei (decimal string), read via eth_getBalance.
   * Optional/never-fail: absent when the RPC read failed — the dust malus is
   * then NOT applied (we don't invent a balance). See scoring.ts §4.3.
   */
  balanceWei?: string;
}

/**
 * Protocol families used for the v2 "protocol diversity" metric (spec M4).
 * Derived from the quest engine; a wallet that touches 5 distinct families is
 * scored higher than one that spams a single protocol.
 */
export type ProtocolCategory =
  | "DEX"
  | "Lending"
  | "Perps"
  | "Identity"
  | "Bridge"
  | "NFT"
  | "Social";

/** Extra signals the data layer derives from quests, fed to computeScore (v2). */
export interface ScoreExtra {
  /** Distinct protocol families touched (from completed quests). */
  categoriesTouched: ProtocolCategory[];
  /** True if the wallet interacted with the canonical L2 bridge (bridge quest). */
  bridgeDone: boolean;
  /** Live ETH balance in wei; absent when the RPC read failed (no dust malus). */
  balanceWei?: string;
}

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface ScoreResult {
  address: string;
  score: number;
  max: number;
  breakdown: ScoreBreakdownItem[];
  /** Share of checked wallets this score beats, in [0,99]. Added by the API route. */
  percentile?: number;
}

export interface QuestResult {
  id: string;
  label: string;
  points: number;
  done: boolean;
  /** External "how to complete" link, if any. Single source of truth: lib/quests.ts. */
  link?: string;
  /** Protocol family for the v2 diversity criterion (absent on uncategorized quests). */
  category?: ProtocolCategory;
}

export interface QuestsResult {
  address: string;
  total: number;
  earned: number;
  quests: QuestResult[];
  /**
   * Distinct protocol families among completed quests (v2 diversity metric).
   * Additive field: existing /api/quests consumers (radar UI) ignore it.
   */
  categoriesTouched?: ProtocolCategory[];
}

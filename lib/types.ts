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
}

export interface QuestResult {
  id: string;
  label: string;
  points: number;
  done: boolean;
}

export interface QuestsResult {
  address: string;
  total: number;
  earned: number;
  quests: QuestResult[];
}

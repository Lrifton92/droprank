/**
 * Format a raw Blockscout etherscan-compat `txlist` item into the compact shape
 * the menu's "ACTIVITY RÉCENTE" strip renders. Pure + testable: no network, no
 * env, no clock — the route does the fetch, this just shapes one row.
 */

import {
  AERODROME_ROUTERS,
  UNISWAP_ROUTERS,
  PANCAKESWAP_ROUTERS,
  MORPHO_CONTRACTS,
  AAVE_CONTRACTS,
  MOONWELL_CONTRACTS,
  COMPOUND_CONTRACTS,
  BASENAMES_CONTROLLERS,
  BASENAMES_REGISTRAR,
  USDC_NATIVE,
  L2_STANDARD_BRIDGE,
  ACROSS_SPOKE_POOL,
} from "./contracts-registry";

/** Raw txlist item (subset we read). Same envelope as Etherscan's. */
export interface RawTx {
  hash: string;
  from: string;
  /** "" on contract creation. */
  to: string;
  /** Value in wei, decimal string. */
  value: string;
  /** Unix seconds, decimal string. */
  timeStamp: string;
  /** Decoded signature e.g. "swapExactTokensForTokens(...)" when known, else "". */
  functionName?: string;
  /** 4-byte selector e.g. "0xa9059cbb"; "0x" for a plain transfer. */
  methodId?: string;
}

/** Shaped row sent to the client. */
export interface RecentTx {
  hash: string;
  label: string;
  action: string;
  valueEth: string;
  timestamp: number;
  incoming: boolean;
}

/**
 * Protocol label by contract address. Built by iterating the registry Sets so a
 * new router added there flows through without editing 50 constants here. A `to`
 * that matches any address in a Set gets that Set's display name.
 */
const LABEL_SETS: Array<[Set<string>, string]> = [
  [AERODROME_ROUTERS, "Aerodrome"],
  [UNISWAP_ROUTERS, "Uniswap"],
  [PANCAKESWAP_ROUTERS, "PancakeSwap"],
  [MORPHO_CONTRACTS, "Morpho"],
  [AAVE_CONTRACTS, "Aave"],
  [MOONWELL_CONTRACTS, "Moonwell"],
  [COMPOUND_CONTRACTS, "Compound"],
  [BASENAMES_CONTROLLERS, "Basenames"],
];

/** Single-address labels (no Set in the registry). */
const LABEL_SINGLES: Array<[string, string]> = [
  [BASENAMES_REGISTRAR, "Basenames"],
  [USDC_NATIVE, "USDC"],
  [L2_STANDARD_BRIDGE, "Bridge"],
  [ACROSS_SPOKE_POOL, "Bridge"],
];

/** Protocol name for a `to` address, or null if it's not a known contract. */
function protocolLabel(to: string): string | null {
  for (const [set, name] of LABEL_SETS) if (set.has(to)) return name;
  for (const [addr, name] of LABEL_SINGLES) if (addr === to) return name;
  return null;
}

/** Short 0x1234…abcd form for an unknown counterparty. */
function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * 4-byte selector -> human verb. Blockscout etherscan-compat returns `methodId`
 * but no `functionName`, so without this most rows would read "interaction".
 * Covers the common Base actions (swaps, approve, transfer, lend, mint, wrap,
 * bridge, claim); an unknown selector falls through to value-derived sentinels.
 */
const SELECTOR_VERBS: Record<string, string> = {
  "0x3593564c": "swap", // Universal Router execute
  "0x5ae401dc": "swap", // multicall (router)
  "0xac9650d8": "swap", // multicall
  "0x38ed1739": "swap",
  "0x7ff36ab5": "swap",
  "0x18cbafe5": "swap",
  "0xb6f9de95": "swap",
  "0x8803dbee": "swap",
  "0x04e45aaf": "swap", // exactInputSingle
  "0x5023b4df": "swap", // exactOutputSingle
  "0x095ea7b3": "approve",
  "0xa9059cbb": "transfer",
  "0x23b872dd": "transfer",
  "0x42842e0e": "transfer", // safeTransferFrom (NFT)
  "0xd0e30db0": "wrap", // WETH deposit
  "0x2e1a7d4d": "unwrap", // WETH withdraw
  "0x617ba037": "supply", // Aave
  "0x474cf53d": "supply",
  "0x6e553f65": "deposit", // ERC-4626
  "0xb6b55f25": "deposit",
  "0xa415bcad": "borrow", // Aave
  "0x573ade81": "repay", // Aave
  "0xe8e33700": "add LP",
  "0xf305d719": "add LP",
  "0x1249c58b": "mint",
  "0x40c10f19": "mint",
  "0xa0712d68": "mint",
  "0x4e71d92d": "claim",
  "0x372500ab": "claim",
};

/**
 * Derive a short, single-word action from the decoded method. Prefers
 * functionName ("swapExactTokensForTokens(...)" -> "swap" via the leading verb),
 * then maps a known 4-byte selector (Blockscout compat path, no functionName),
 * else "" (the caller then derives "transfer"/"interaction" from value).
 */
function deriveMethod(raw: RawTx): string {
  const fn = (raw.functionName ?? "").trim();
  if (fn) {
    const paren = fn.indexOf("(");
    return (paren >= 0 ? fn.slice(0, paren) : fn).trim();
  }
  const id = (raw.methodId ?? "").toLowerCase();
  return SELECTOR_VERBS[id] ?? "";
}

/** wei (decimal string) -> short ETH string, "" when zero/invalid. */
function formatEth(value: string): string {
  if (!value || value === "0") return "";
  let wei: bigint;
  try {
    wei = BigInt(value);
  } catch {
    return "";
  }
  if (wei === BigInt(0)) return "";
  const eth = Number(wei) / 1e18;
  if (!Number.isFinite(eth) || eth <= 0) return "";
  // Up to 4 sig digits, trimmed: 0.0012, 1.5, 0.42.
  const s = eth < 1 ? eth.toFixed(4) : eth.toFixed(3);
  const trimmed = s.replace(/\.?0+$/, "");
  // A value below the display precision trims to "0" — show nothing instead of a
  // bare "0" (e.g. a token swap with no ETH, or sub-0.0001 dust).
  return trimmed === "0" ? "" : trimmed;
}

/**
 * Shape one raw tx for the menu activity strip.
 *
 * @param raw a txlist item from Blockscout etherscan-compat.
 * @param walletAddr the scanned wallet, LOWERCASE (the caller lowercases it).
 *   Returns labels as one of: a known protocol name, "Received" (incoming, marked
 *   by the caller's i18n via the `incoming` flag — here we leave a stable
 *   sentinel the route maps), a deploy sentinel, or a short counterparty address.
 */
export function formatRecentTx(raw: RawTx, walletAddr: string): RecentTx {
  const to = (raw.to ?? "").toLowerCase();
  const incoming = to !== "" && to === walletAddr;

  let label: string;
  const known = to ? protocolLabel(to) : null;
  if (known) {
    label = known;
  } else if (incoming) {
    // Sentinel; the API route swaps this for the localized "Received".
    label = "__received__";
  } else if (to === "") {
    label = "__deploy__";
  } else {
    label = shortAddr(to);
  }

  // Action: decoded verb if any, else value-derived sentinel the route localizes.
  const method = deriveMethod(raw);
  const hasValue = raw.value !== "" && raw.value !== "0";
  const action = method ? method : hasValue ? "__transfer__" : "__interaction__";

  return {
    hash: raw.hash,
    label,
    action,
    valueEth: formatEth(raw.value),
    timestamp: Number(raw.timeStamp) || 0,
    incoming,
  };
}

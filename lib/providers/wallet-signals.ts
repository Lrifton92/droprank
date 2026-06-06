/**
 * Pure detection helpers over the internal-tx and token-transfer passes, shared by
 * both providers (Etherscan v2 native + Blockscout) so the score and quests data
 * paths derive identical signals. Each function operates on a tiny normalized shape
 * so each provider only adapts its raw rows once.
 *
 * Signals produced:
 *  - inboundBridge   : an internal tx FROM a known bridge with value > 0 (existing).
 *  - internalOutTo   : the `to` of the wallet's OUTGOING internal txs (FIX A).
 *  - receivedUsdc    : an inbound ERC-20 transfer of native USDC (FIX D).
 *  - mintedNft       : an ERC-721/1155 transfer FROM the zero address (FIX D/E).
 */

import { BRIDGE_CONTRACTS, USDC_NATIVE } from "../contracts-registry";

/** Minimal internal-tx shape (from/to/value), lowercased by the caller or here. */
export interface InternalRow {
  from: string | null;
  to: string | null;
  value: string;
}

/** Minimal token-transfer shape: `type` distinguishes ERC-20 from ERC-721/1155. */
export interface TokenTransferRow {
  from: string | null;
  to: string | null;
  /** Contract address of the token. */
  token: string | null;
  /** "ERC-20" | "ERC-721" | "ERC-1155" (any casing). */
  type: string | null;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** Cap on distinct internal `to` addresses kept (one hit per protocol suffices). */
export const INTERNAL_OUT_CAP = 200;

const lc = (s: string | null | undefined): string => (s ?? "").toLowerCase();

/**
 * Inbound bridge fill: an internal tx whose `from` is a known bridge contract,
 * delivering value (> 0) to the wallet. Pure; value parse failures count as 0.
 */
export function detectInboundBridge(items: InternalRow[], address: string): boolean {
  const addr = address.toLowerCase();
  for (const it of items) {
    if (!BRIDGE_CONTRACTS.has(lc(it.from))) continue;
    if (lc(it.to) !== addr) continue;
    try {
      if (BigInt(it.value || "0") > BigInt(0)) return true;
    } catch {
      // Malformed value -> treat as 0 (no fill).
    }
  }
  return false;
}

/**
 * Distinct, lowercased `to` addresses of the wallet's OUTGOING internal txs (from =
 * the wallet). Capped at {@link INTERNAL_OUT_CAP}. Self-targets and null `to` are
 * dropped. Pure.
 */
export function collectInternalOutTo(items: InternalRow[], address: string): string[] {
  const addr = address.toLowerCase();
  const out = new Set<string>();
  for (const it of items) {
    if (lc(it.from) !== addr) continue;
    const to = lc(it.to);
    if (!to || to === addr) continue;
    out.add(to);
    if (out.size >= INTERNAL_OUT_CAP) break;
  }
  return [...out];
}

/** True when the wallet received native USDC as an inbound ERC-20 transfer. */
export function detectReceivedUsdc(items: TokenTransferRow[], address: string): boolean {
  const addr = address.toLowerCase();
  for (const it of items) {
    if (lc(it.token) !== USDC_NATIVE) continue;
    if (lc(it.to) === addr) return true;
  }
  return false;
}

/**
 * True when the wallet was the recipient of an ERC-721/1155 transfer FROM the zero
 * address — a mint — regardless of method name. ERC-20 transfers from 0x0 (token
 * issuance airdrops) are intentionally NOT counted as NFT mints.
 */
export function detectMintedNft(items: TokenTransferRow[], address: string): boolean {
  const addr = address.toLowerCase();
  for (const it of items) {
    const t = lc(it.type);
    if (t !== "erc-721" && t !== "erc-1155") continue;
    if (lc(it.from) !== ZERO) continue;
    if (lc(it.to) === addr) return true;
  }
  return false;
}

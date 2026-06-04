import { fetchWalletData as fetchViaEtherscan } from "./providers/etherscan";
import { fetchWalletData as fetchViaBlockscout } from "./providers/blockscout";
import { computeScore } from "./scoring";
import { computeQuests } from "./quests";
import type { ScoreResult, WalletData } from "./types";

/**
 * Fetch wallet data with Etherscan v2 as the PRIMARY source (single-call, fast)
 * and keyless Blockscout as the FALLBACK.
 *
 * Etherscan is skipped or abandoned when ETHERSCAN_API_KEY is missing, or the
 * Etherscan call throws/times out — in which case we transparently fall back to
 * Blockscout. The aggregated WalletData shape is identical for both sources, so
 * scoring/quests are unaffected by which one served the request. An aborted
 * request (caller cancelled) is NOT retried on the fallback.
 */
async function fetchWalletData(
  address: string,
  signal?: AbortSignal,
): Promise<WalletData> {
  try {
    return await fetchViaEtherscan(address, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn(
      "[score] Etherscan unavailable, falling back to Blockscout:",
      e instanceof Error ? e.message : e,
    );
    return await fetchViaBlockscout(address, signal);
  }
}

/**
 * Fetch on-chain data and compute the authoritative score for an address.
 *
 * Shared by /api/score (display) and /api/sign-score (attestation). The signing
 * route MUST recompute the score here — the client never supplies it.
 *
 * @throws BlockscoutError/EtherscanError on data-layer failures (caller maps to
 *   HTTP status; the route already handles BlockscoutError, and EtherscanError is
 *   only surfaced when BOTH sources fail, hitting the generic 500 path).
 */
export async function scoreAddress(
  address: string,
  signal?: AbortSignal,
): Promise<ScoreResult> {
  const addr = address.toLowerCase();
  const data = await fetchWalletData(addr, signal);
  const quests = computeQuests(data.txs, addr, {
    isSmartWallet: data.usedSmartWallet,
  });
  // v1: Basename ownership is approximated from the registration quest.
  // TODO: replace with a true Basenames reverse resolution read.
  const hasBasename = quests.quests.find((q) => q.id === "basename")!.done;
  return computeScore({ ...data, hasBasename }, quests.earned);
}

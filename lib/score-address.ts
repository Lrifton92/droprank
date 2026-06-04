import { fetchWalletData as fetchViaEtherscan } from "./providers/etherscan";
import { fetchWalletData as fetchViaBlockscout } from "./providers/blockscout";
import { computeScore } from "./scoring";
import { computeQuests } from "./quests";
import type { ScoreResult, WalletData } from "./types";

/**
 * Module-level circuit breaker for Etherscan.
 *
 * Why: Etherscan v2's FREE tier no longer serves Base mainnet (chainid 8453) —
 * every txlist call returns `status:0, result:"Free API access is not supported
 * for this chain..."`. Without a breaker we'd burn a full (retried, ~timeout)
 * Etherscan round-trip on EVERY scan before falling back to Blockscout, which is
 * the exact symptom seen in prod. Once we detect that signature we remember it
 * for ~1h and go straight to Blockscout. The flag self-expires so a later plan
 * upgrade (paid tier) is picked up without a redeploy. The Etherscan code stays
 * intact for that case (do not delete — post-launch roadmap).
 */
const ETHERSCAN_SKIP_TTL_MS = 60 * 60 * 1000;
let etherscanUnavailableUntil = 0;

/** True when an Etherscan error signals the chain isn't covered by the plan. */
function isChainNotSupported(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("not supported for this chain");
}

/** Test-only hook to reset the breaker between cases. */
export function __resetEtherscanBreaker(): void {
  etherscanUnavailableUntil = 0;
}

/**
 * Fetch wallet data with Etherscan v2 as the PRIMARY source (single-call, fast)
 * and keyless Blockscout as the FALLBACK.
 *
 * Etherscan is skipped or abandoned when ETHERSCAN_API_KEY is missing, or the
 * Etherscan call throws/times out — in which case we transparently fall back to
 * Blockscout. It is ALSO skipped for ~1h once it reports the active chain isn't
 * supported by the plan (circuit breaker above). The aggregated WalletData shape
 * is identical for both sources, so scoring/quests are unaffected by which one
 * served the request. An aborted request (caller cancelled) is NOT retried on
 * the fallback.
 */
async function fetchWalletData(
  address: string,
  signal?: AbortSignal,
): Promise<WalletData> {
  if (Date.now() < etherscanUnavailableUntil) {
    return await fetchViaBlockscout(address, signal);
  }
  try {
    return await fetchViaEtherscan(address, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    if (isChainNotSupported(e)) {
      etherscanUnavailableUntil = Date.now() + ETHERSCAN_SKIP_TTL_MS;
      console.warn(
        "[score] Etherscan does not cover this chain on the current plan; " +
          "skipping it for 1h and using Blockscout.",
      );
    } else {
      console.warn(
        "[score] Etherscan unavailable, falling back to Blockscout:",
        e instanceof Error ? e.message : e,
      );
    }
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

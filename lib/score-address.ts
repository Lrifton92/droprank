import {
  fetchWalletData as fetchViaEtherscan,
  fetchWalletDataViaBlockscoutCompat as fetchViaBlockscoutCompat,
  fetchBalanceViaRpc,
} from "./providers/etherscan";
import { fetchWalletData as fetchViaBlockscout } from "./providers/blockscout";
import { fetchTalentBuilderScore } from "./providers/talent";
import { fetchOwnsBasename } from "./providers/basename";
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
 * Keyless fallback chain: fast Blockscout etherscan-compat (~1 call, ~500ms),
 * then the slow v2 cursor client (25+ sequential pages, ~34s) as last resort.
 *
 * Why this order: both are keyless and serve Base, but the etherscan-compat
 * endpoint returns up to 10000 txs in ONE call, collapsing the cold-scan latency
 * that the v2 cursor pagination causes. The v2 client stays the safety net for
 * the rare case the compat endpoint is degraded. An aborted request is NOT
 * retried on the next link.
 */
async function fetchViaKeylessChain(
  address: string,
  signal?: AbortSignal,
): Promise<WalletData> {
  try {
    return await fetchViaBlockscoutCompat(address, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn(
      "[score] Blockscout etherscan-compat unavailable, using v2 cursor:",
      e instanceof Error ? e.message : e,
    );
    return await fetchViaBlockscout(address, signal);
  }
}

/**
 * Fetch wallet data through a three-link chain, each shape-identical so
 * scoring/quests are unaffected by which source served the request:
 *   1. Etherscan v2 official (single-call, fast) — needs a key, skipped when the
 *      key is missing or the circuit breaker is armed (chain not on plan).
 *   2. Blockscout etherscan-compat (keyless, ~500ms single call) — the cold-scan
 *      win; see fetchViaKeylessChain.
 *   3. Blockscout v2 cursor (keyless, slow) — last resort.
 *
 * Etherscan failures (throw/timeout/chain-not-supported) transparently drop to
 * the keyless chain. An aborted request (caller cancelled) is NOT retried.
 *
 * Exported so BOTH /api/score and /api/quests scan through the SAME fast chain
 * (single-call etherscan-compat, 10k-tx cap, deep-history asc pull). The quests
 * route used to call blockscout.fetchWalletData directly — the slow v2 cursor
 * (3k-tx cap, ~60 sequential pages), which truncated heavy farmers' founding
 * protocol txs AND timed out. Sharing this chain fixes both and keeps the two
 * routes consistent. The module-level Etherscan breaker is shared on purpose.
 */
export async function fetchWalletDataChained(
  address: string,
  signal?: AbortSignal,
): Promise<WalletData> {
  if (Date.now() < etherscanUnavailableUntil) {
    return await fetchViaKeylessChain(address, signal);
  }
  try {
    return await fetchViaEtherscan(address, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    if (isChainNotSupported(e)) {
      etherscanUnavailableUntil = Date.now() + ETHERSCAN_SKIP_TTL_MS;
      console.warn(
        "[score] Etherscan does not cover this chain on the current plan; " +
          "skipping it for 1h and using keyless Blockscout.",
      );
    } else {
      console.warn(
        "[score] Etherscan unavailable, falling back to keyless Blockscout:",
        e instanceof Error ? e.message : e,
      );
    }
    return await fetchViaKeylessChain(address, signal);
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
  // The keyless onchain Talent Builder Score read runs in parallel with the scan
  // so it never lengthens the cold scan. Never-fail: 0 on any RPC error.
  const [data, talentBuilderScore, ownsBasename] = await Promise.all([
    fetchWalletDataChained(addr, signal),
    fetchTalentBuilderScore(addr, signal),
    fetchOwnsBasename(addr, signal),
  ]);
  const quests = computeQuests(data.txs, addr, {
    isSmartWallet: data.usedSmartWallet,
    inboundBridge: data.inboundBridge,
    internalOutTo: data.internalOutTo,
    receivedUsdc: data.receivedUsdc,
    mintedNft: data.mintedNft,
    talentBuilderScore,
    ownsBasename,
  });
  // v1: Basename ownership is approximated from the registration quest.
  // TODO: replace with a true Basenames reverse resolution read.
  const hasBasename = quests.quests.find((q) => q.id === "basename")!.done;
  const bridgeDone = quests.quests.find((q) => q.id === "bridge-canonical")!.done;

  // v2 enrichment: one keyless eth_getBalance for the dust malus (spec §4.3).
  // Never-fail: null balance -> the dust malus simply won't fire.
  const balanceWei = await fetchBalanceViaRpc(addr, signal);

  return computeScore({ ...data, hasBasename }, quests.earned, {
    categoriesTouched: quests.categoriesTouched ?? [],
    bridgeDone,
    balanceWei: balanceWei ?? undefined,
  });
}

import { fetchWalletData } from "./providers/blockscout";
import { computeScore } from "./scoring";
import { computeQuests } from "./quests";
import type { ScoreResult } from "./types";

/**
 * Fetch on-chain data and compute the authoritative score for an address.
 *
 * Shared by /api/score (display) and /api/sign-score (attestation). The signing
 * route MUST recompute the score here — the client never supplies it.
 *
 * @throws BlockscoutError on data-layer failures (caller maps to HTTP status).
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

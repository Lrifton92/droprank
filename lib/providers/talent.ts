/**
 * Talent Protocol Builder Score provider — KEYLESS, read directly onchain.
 *
 * The Builder Score is created off-chain on talent.app, but it is also written
 * onchain on Base by the PassportBuilderScore contract, so it can be read with no
 * API key (the Talent API key is gated behind paid Talent+, unacceptable for a
 * free app). We read it via a public Base RPC.
 *
 * Contract: PassportBuilderScore (TALENT_BUILDER_SCORE in contracts-registry.ts).
 *   getLastUpdateByAddress(address) -> uint256
 *     NEVER reverts: 0 = no passport (never created a Builder Score), otherwise
 *     the unix timestamp of the last score update. We use THIS (robust) rather
 *     than getScoreByAddress, which reverts "Score is expired" / "Passport ID
 *     does not exist". A non-zero value = the wallet created a Builder Score
 *     (even if currently expired), which is exactly what the quest rewards.
 *
 * Verified live on Base:
 *   0x1deeaEc4250e66702E22777Ec1E3A70B19745A72 -> 1764568729 (created, expired)
 *   0xb0e367575b4724b26af191b2d8991373fa7cc857 -> 0           (never)
 *
 * Never-fail: any RPC error yields 0 — the talent-builder-score quest then simply
 * falls back to its onchain TALENT_CONTRACTS tx signal and the scan is otherwise
 * unaffected. This mirrors fetchBalanceViaRpc: an enrichment that degrades
 * silently, never a dependency.
 */
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { TALENT_BUILDER_SCORE } from "../contracts-registry";

/** Minimal ABI: only the never-reverting view we read. */
const PASSPORT_BUILDER_SCORE_ABI = [
  {
    type: "function",
    name: "getLastUpdateByAddress",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Public Base mainnet client (keyless), shared across scans. */
const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

/** Builder Score moves slowly; a 6h in-memory TTL spares the RPC across scans. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Per-instance L1 cache: address (lowercased) -> { value, expires }. */
const cache = new Map<string, { value: number; expires: number }>();

/** Test-only hook to clear the module cache between cases. */
export function __resetTalentCache(): void {
  cache.clear();
}

/**
 * Read the wallet's onchain Talent Builder Score signal. Returns the last-update
 * timestamp (number; 0 when the wallet never created a Builder Score, or on any
 * RPC error). Never throws. Cached per-instance for 6h. `signal` is accepted to
 * keep the call site uniform; viem reads are short-lived so it is not threaded in.
 */
export async function fetchTalentBuilderScore(
  address: string,
  _signal: AbortSignal | undefined,
): Promise<number> {
  const addr = address.toLowerCase();
  const hit = cache.get(addr);
  if (hit && hit.expires > Date.now()) return hit.value;

  try {
    const raw = (await client.readContract({
      address: TALENT_BUILDER_SCORE as `0x${string}`,
      abi: PASSPORT_BUILDER_SCORE_ABI,
      functionName: "getLastUpdateByAddress",
      args: [addr as `0x${string}`],
    })) as bigint;
    const value = Number(raw);
    cache.set(addr, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (e) {
    console.warn(
      "[talent] onchain Builder Score read failed; quest falls back to the tx signal:",
      e instanceof Error ? e.message : e,
    );
    return 0;
  }
}

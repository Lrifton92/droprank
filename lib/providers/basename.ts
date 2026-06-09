/**
 * Basename ownership provider — KEYLESS, read directly onchain.
 *
 * The "Register a Basename" quest used to fire only on a registration tx to a
 * known controller. That misses holders who RECEIVED a basename by transfer, or
 * whose registration tx is older than the scan window (heavy farmers) — they own
 * the name but show no controller tx. The truthful signal is NFT ownership:
 * balanceOf on the BaseRegistrar (.base.eth ERC-721) > 0.
 *
 * Contract: BaseRegistrar (BASENAMES_REGISTRAR in contracts-registry.ts).
 *   balanceOf(owner) -> uint256   (standard ERC-721 view, never reverts)
 *
 * Verified live on Base 2026-06-09:
 *   0x1deeaEc4250e66702E22777Ec1E3A70B19745A72 (lrifton92.base.eth) -> 1
 *   0xedc48087e7530069a664deaea6bf1e69b807935f (no basename)         -> 0
 *
 * Never-fail: any RPC error yields false — the basename quest then falls back to
 * its registration-tx signal and the scan is otherwise unaffected. Mirrors
 * lib/providers/talent.ts: an enrichment that degrades silently, never a
 * dependency.
 */
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BASENAMES_REGISTRAR } from "../contracts-registry";

/** Minimal ABI: only the ERC-721 view we read. */
const BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Public Base mainnet client (keyless), shared across scans. */
const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

/** Basename ownership rarely changes; a 6h in-memory TTL spares the RPC. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Per-instance L1 cache: address (lowercased) -> { value, expires }. */
const cache = new Map<string, { value: boolean; expires: number }>();

/** Test-only hook to clear the module cache between cases. */
export function __resetBasenameCache(): void {
  cache.clear();
}

/**
 * True when the wallet owns at least one .base.eth Basename NFT (balanceOf > 0).
 * Returns false when it owns none, or on any RPC error. Never throws. Cached
 * per-instance for 6h. `signal` is accepted to keep the call site uniform; viem
 * reads are short-lived so it is not threaded in.
 */
export async function fetchOwnsBasename(
  address: string,
  _signal: AbortSignal | undefined,
): Promise<boolean> {
  const addr = address.toLowerCase();
  const hit = cache.get(addr);
  if (hit && hit.expires > Date.now()) return hit.value;

  try {
    const raw = (await client.readContract({
      address: BASENAMES_REGISTRAR as `0x${string}`,
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [addr as `0x${string}`],
    })) as bigint;
    const value = raw > BigInt(0);
    cache.set(addr, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (e) {
    console.warn(
      "[basename] onchain ownership read failed; quest falls back to the registration tx signal:",
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

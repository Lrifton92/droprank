/**
 * Canary — autonomous detection of migrated DEX routers.
 *
 * When a DEX (PancakeSwap, Uniswap, Aerodrome, Pendle) swaps out the periphery
 * router its UI routes through, the hardcoded allowlist in contracts-registry.ts
 * goes stale and the matching quest silently breaks (it happened twice for
 * PancakeSwap: Universal Router 2026-06-09, Infinity Aggregator 2026-06-11).
 *
 * The canary anchors on a STABLE high-volume pool of each protocol — pools never
 * migrate — reads the entrypoints (`tx.to`) of recent swaps that hit it, and
 * flags any recurring entrypoint that isn't already known. A strict verification
 * gate (verified source must reference the protocol's own libraries) keeps it
 * from adopting third-party aggregators (1inch/Odos) or spoofs. Confirmed
 * routers are written to KV and folded into detection with no code deploy.
 *
 * This module is PURE (no I/O) so it is exhaustively unit-tested. Network lives
 * in canary-fetch.ts; KV in canary-store.ts; orchestration in /api/canary.
 */

const lc = (a: string) => a.toLowerCase();

export interface Candidate {
  /** Lowercased entrypoint address. */
  addr: string;
  /** How many of the sampled recent swaps routed through it. */
  count: number;
}

/**
 * From the entrypoints (`tx.to`) of recently sampled swaps on an anchor pool,
 * return the ones NOT already known that recur at least `minCount` times, most
 * frequent first. The frequency floor drops one-off arbitrage/aggregator noise;
 * a protocol's own UI router dominates a high-volume pool's recent flow.
 */
export function findCandidates(
  entrypoints: readonly string[],
  known: ReadonlySet<string>,
  minCount: number,
): Candidate[] {
  const counts = new Map<string, number>();
  for (const raw of entrypoints) {
    if (!raw) continue;
    const a = lc(raw);
    if (known.has(a)) continue;
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .map(([addr, count]) => ({ addr, count }))
    .sort((x, y) => y.count - x.count);
}

export interface ContractMeta {
  /** The candidate contract is verified on the explorer. */
  isVerified: boolean;
  /**
   * Lowercased haystack to match signatures against: the contract name plus its
   * verified source and the file paths of its imported sources (where a fork's
   * library lineage like `infinity-core` shows up). Composed in canary-fetch.ts.
   */
  text: string;
}

/**
 * The verification gate: a candidate only joins the allowlist if it is verified
 * AND its source references one of the protocol's own library signatures. This
 * is exactly the manual check done for the Infinity Aggregator (its source
 * imports `infinity-core`/`infinity-periphery`). It rejects unverified contracts
 * and generic third-party aggregators that route the same pools.
 */
export function passesGate(
  meta: ContractMeta,
  libSignatures: readonly string[],
): boolean {
  if (!meta.isVerified) return false;
  const text = lc(meta.text);
  return libSignatures.some((s) => text.includes(lc(s)));
}

/**
 * Canary network layer — Blockscout reads (keyless, same explorer the data layer
 * already uses). Kept separate from the pure logic (lib/canary.ts) so the logic
 * stays unit-tested and this thin I/O is exercised only by the live cron.
 *
 * Discovery is gate-driven, not frequency-driven: a shared high-volume pool is
 * routed through by many entrypoints (third-party aggregators, Multicall3, 4337
 * EntryPoints, MEV bots), and a protocol's own UI router can be a rare minority
 * of that flow (the PancakeSwap Infinity Aggregator showed up once in 25 sampled
 * swaps). So we surface ALL distinct unknown entrypoints and let the verification
 * gate decide — the noise is unverified or doesn't import the protocol's libs.
 */

import type { ContractMeta } from "./canary";

const BLOCKSCOUT = "https://base.blockscout.com/api/v2";

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Run `fn` over `items` with bounded concurrency, preserving order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

/**
 * The lowercased entrypoints (`tx.to`) of recent swaps that cleared through an
 * anchor pool. Reads the pool's logs (one entry per Swap event), dedupes to
 * distinct txs (capped at `sampleTxs`), and resolves each tx's top-level `to`.
 * Best-effort: any per-tx failure is skipped; a total failure returns [].
 */
export async function fetchRecentSwapEntrypoints(
  pool: string,
  sampleTxs = 30,
  signal?: AbortSignal,
): Promise<string[]> {
  let logs: unknown;
  try {
    logs = await getJson(
      `${BLOCKSCOUT}/addresses/${pool}/logs?items_count=50`,
      signal,
    );
  } catch {
    return [];
  }
  const items = (logs as { items?: { transaction_hash?: string }[] }).items ?? [];
  const hashes: string[] = [];
  for (const it of items) {
    const h = it.transaction_hash;
    if (h && !hashes.includes(h)) hashes.push(h);
    if (hashes.length >= sampleTxs) break;
  }

  const tos = await mapLimit(hashes, 6, async (h) => {
    try {
      const tx = (await getJson(
        `${BLOCKSCOUT}/transactions/${h}`,
        signal,
      )) as { to?: { hash?: string } | null };
      return tx.to?.hash?.toLowerCase() ?? null;
    } catch {
      // Skip this tx; one bad fetch must not abort the sweep.
      return null;
    }
  });
  return tos.filter((a): a is string => a !== null);
}

/**
 * Verification metadata for the gate: whether the candidate is a verified
 * contract, and a haystack (name + source + imported file paths, lowercased)
 * where a fork's library lineage (e.g. `infinity-core`) surfaces. An unverified
 * contract (Blockscout 404s its smart-contract record) yields isVerified=false.
 */
export async function fetchContractMeta(
  addr: string,
  signal?: AbortSignal,
): Promise<ContractMeta> {
  // Belt-and-suspenders: only ever interpolate a clean 20-byte hex address into
  // the explorer URL (these come from on-chain `tx.to`, but never trust the shape).
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return { isVerified: false, text: "" };
  let data: {
    name?: string | null;
    source_code?: string | null;
    is_verified?: boolean;
    additional_sources?: { file_path?: string; source_code?: string | null }[];
  };
  try {
    data = (await getJson(
      `${BLOCKSCOUT}/smart-contracts/${addr}`,
      signal,
    )) as typeof data;
  } catch {
    return { isVerified: false, text: "" };
  }
  const hasSource =
    typeof data.source_code === "string" && data.source_code.length > 0;
  const isVerified = data.is_verified !== false && (hasSource || !!data.name);
  if (!isVerified) return { isVerified: false, text: "" };

  const parts: string[] = [data.name ?? "", data.source_code ?? ""];
  for (const s of data.additional_sources ?? []) {
    if (s.file_path) parts.push(s.file_path);
    if (s.source_code) parts.push(s.source_code);
  }
  return { isVerified: true, text: parts.join("\n").toLowerCase() };
}

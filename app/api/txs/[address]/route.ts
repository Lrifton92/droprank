import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { BLOCKSCOUT_COMPAT_URL } from "@/lib/providers/etherscan";
import { LruCache, checkRateLimit } from "@/lib/cache";
import { getOrSetCached } from "@/lib/shared-cache";
import { formatRecentTx, type RawTx, type RecentTx } from "@/lib/recent-activity";

/**
 * Lightweight recent-activity feed for the menu strip. This is NOT the full
 * scan: it pulls ONE keyless Blockscout etherscan-compat page (offset=12, newest
 * first) and shapes the last 8 txs. NEVER-FAIL: any upstream error returns
 * { txs: [] } (200) so the menu's activity block can't break the page.
 */

interface TxsResult {
  txs: RecentTx[];
}

const cache = new LruCache<TxsResult>(500, 60 * 1000);
const TTL_S = 60;
const FETCH_TIMEOUT_MS = 8_000;

interface CompatEnvelope {
  status: string;
  message: string;
  result: RawTx[] | string;
}

async function fetchRecent(addr: string, signal: AbortSignal | undefined): Promise<TxsResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const u = new URL(BLOCKSCOUT_COMPAT_URL);
    u.searchParams.set("module", "account");
    u.searchParams.set("action", "txlist");
    u.searchParams.set("address", addr);
    u.searchParams.set("sort", "desc");
    u.searchParams.set("page", "1");
    u.searchParams.set("offset", "12");
    const res = await fetch(u.toString(), { signal: ctrl.signal });
    if (!res.ok) return { txs: [] };
    const env = (await res.json()) as CompatEnvelope;
    const items = Array.isArray(env.result) ? env.result : [];
    const txs = items.slice(0, 8).map((it) => formatRecentTx(it, addr));
    return { txs };
  } catch {
    // NEVER-FAIL: down/aborted/parse error -> empty feed.
    return { txs: [] };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!(await checkRateLimit(req, { prefix: "txs", limit: 30, windowSeconds: 60 }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const addr = address.toLowerCase();
  // v1: shape of RecentTx. Bump on any change to the shaped row.
  const result = await getOrSetCached(cache, "txs", `v1:${addr}`, TTL_S, () =>
    fetchRecent(addr, req.signal),
  );
  return NextResponse.json(result, {
    headers: { "cache-control": "public, max-age=30, s-maxage=60" },
  });
}

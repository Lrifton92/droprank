import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { fetchWalletData, BlockscoutError } from "@/lib/providers/blockscout";
import { computeQuests } from "@/lib/quests";
import { LruCache, RateLimiter, clientIp } from "@/lib/cache";
import type { QuestsResult } from "@/lib/types";

const cache = new LruCache<QuestsResult>(500, 5 * 60 * 1000);
const limiter = new RateLimiter(30, 60_000);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!limiter.allow(clientIp(req))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300" },
    });
  }

  try {
    const data = await fetchWalletData(key, req.signal);
    const result = computeQuests(data.txs, key, {
      isSmartWallet: data.usedSmartWallet,
    });
    cache.set(key, result);
    return NextResponse.json(result, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300" },
    });
  } catch (e) {
    if (e instanceof BlockscoutError) {
      const status = e.kind === "invalid_address" ? 400 : 502;
      return NextResponse.json({ error: e.message, kind: e.kind }, { status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

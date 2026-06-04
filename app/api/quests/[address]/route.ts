import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { fetchWalletData, BlockscoutError } from "@/lib/providers/blockscout";
import { computeQuests } from "@/lib/quests";
import { LruCache, checkRateLimit } from "@/lib/cache";
import { getOrSetCached } from "@/lib/shared-cache";
import type { QuestsResult } from "@/lib/types";

const cache = new LruCache<QuestsResult>(500, 5 * 60 * 1000);
const QUESTS_TTL_S = 5 * 60;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ address: string }> },
) {
  const { address } = await ctx.params;

  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!(await checkRateLimit(req, {
    prefix: "quests",
    limit: 30,
    windowSeconds: 60,
  }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const key = address.toLowerCase();

  try {
    // L1 (in-memory) -> L2 (Upstash) -> compute. Never fails on store errors.
    const result = await getOrSetCached(cache, "quests", key, QUESTS_TTL_S, async () => {
      const data = await fetchWalletData(key, req.signal);
      return computeQuests(data.txs, key, {
        isSmartWallet: data.usedSmartWallet,
      });
    });
    return NextResponse.json(result, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300" },
    });
  } catch (e) {
    if (e instanceof BlockscoutError) {
      if (e.kind === "invalid_address") {
        return NextResponse.json({ error: "Invalid address" }, { status: 400 });
      }
      console.error("[quests] upstream error:", e.kind, e.message);
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 502 },
      );
    }
    console.error("[quests] internal error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

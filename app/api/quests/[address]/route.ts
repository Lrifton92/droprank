import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { fetchWalletData, BlockscoutError } from "@/lib/providers/blockscout";
import { fetchTalentBuilderScore } from "@/lib/providers/talent";
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

  // Versioned cache-key prefix. v2 (2026-06-06): bridge detection started
  // consuming internal txs. v3 (2026-06-06, PHASE 2): the token-transfer pass +
  // outgoing internal targets land. v4 (2026-06-07): the off-chain Talent Builder
  // Score (ctx.talentBuilderScore) lands — talent-builder-score can now flip
  // done=true for a wallet with no onchain Talent tx, so v3 payloads MUST NOT be
  // reused. Stale entries expire on their own (TTL 5min). NB: `key` is the cache
  // key only; the metier address passed to fetchWalletData is `addr` (never the key).
  const addr = address.toLowerCase();
  const key = `v4:${addr}`;

  try {
    // L1 (in-memory) -> L2 (Upstash) -> compute. Never fails on store errors.
    const result = await getOrSetCached(cache, "quests", key, QUESTS_TTL_S, async () => {
      // Talent Builder Score runs in parallel with the on-chain scan (never-fail).
      const [data, talentBuilderScore] = await Promise.all([
        fetchWalletData(addr, req.signal),
        fetchTalentBuilderScore(addr, req.signal),
      ]);
      return computeQuests(data.txs, addr, {
        isSmartWallet: data.usedSmartWallet,
        inboundBridge: data.inboundBridge,
        internalOutTo: data.internalOutTo,
        receivedUsdc: data.receivedUsdc,
        mintedNft: data.mintedNft,
        talentBuilderScore,
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

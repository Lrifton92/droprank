import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { BlockscoutError } from "@/lib/providers/blockscout";
import { fetchWalletDataChained } from "@/lib/score-address";
import { fetchTalentBuilderScore } from "@/lib/providers/talent";
import { fetchOwnsBasename } from "@/lib/providers/basename";
import { computeQuests } from "@/lib/quests";
import { LruCache, checkRateLimit } from "@/lib/cache";
import { getOrSetCached } from "@/lib/shared-cache";
import type { QuestsResult } from "@/lib/types";

// Deep-history wallets (heavy farmers, >10k txs) need two 10k-tx fetches + a
// 20k-tx parse on a cold scan — well past Vercel's default function timeout,
// which was already truncating these scans. Raise the ceiling so the cold scan
// completes (cached 5min after). 60 = the Hobby max.
export const maxDuration = 60;

// 90s TTL (was 5min): a farmer who just did a quest expects to see it fast. The
// `?fresh=1` rescan bypasses this entirely; the short TTL just bounds how long a
// passive view can lag. Cold scans are cached, so the extra recompute is modest.
const cache = new LruCache<QuestsResult>(500, 90 * 1000);
const QUESTS_TTL_S = 90;

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
  // outgoing internal targets land. v4 (2026-06-07): the keyless onchain Talent
  // Builder Score (ctx.talentBuilderScore) lands — talent-builder-score can now
  // flip done=true for a wallet with no Talent tx, so v3 payloads MUST NOT be
  // reused. (The off-chain-API→onchain pivot keeps the same shape — a number per
  // address that flips the same quest — so v4 is NOT re-bumped.) Stale entries
  // expire on their own (TTL 5min). NB: `key` is the cache
  // key only; the metier address passed to fetchWalletData is `addr` (never the key).
  const addr = address.toLowerCase();
  // v5 (2026-06-07): the v4 namespace was polluted by the short-lived paid-API
  // Talent build (commit 6c4283e ran in prod with no key → talentBuilderScore=0
  // → talent-builder-score cached done=false). The onchain pivot keeps shape but
  // FLIPS that result, so v4 payloads MUST NOT be reused — bump to v5.
  // v6 (2026-06-09): extended the swap-aerodrome / swap-pancakeswap / lend-morpho
  // detection to the aggregated routers real UIs dispatch through (Aerodrome +
  // PancakeSwap Universal Routers, Morpho Bundler3). Wallets that swapped/deposited
  // via those were cached done=false, and the fix FLIPS them — so v5 payloads MUST
  // NOT be reused — bump to v6.
  // v7 (2026-06-09): the cross-protocol audit added more current aggregated
  // entrypoints (Uniswap v4 UR, Aave WrappedTokenGatewayV3, Compound BaseBulker,
  // Moonwell WETHRouter + 12 mTokens, Basenames legacy controller) — these also
  // flip quests done=true, so v6 payloads MUST NOT be reused — bump to v7.
  // v8 (2026-06-09): two changes flip results. (1) The scan now runs through the
  // fast chain (etherscan-compat 10k + asc) instead of the 3k-cap cursor, so deep-
  // history wallets surface founding protocol txs they were missing. (2) The
  // basename quest now validates on NFT ownership (balanceOf), catching holders
  // who received one or registered before the window. v7 payloads MUST NOT be
  // reused — bump to v8.
  const key = `v8:${addr}`;

  // `?fresh=1` forces a recompute (skips both cache tiers) — the rescan button
  // uses it so a quest the user JUST completed shows immediately.
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  try {
    // L1 (in-memory) -> L2 (Upstash) -> compute. Never fails on store errors.
    const result = await getOrSetCached(cache, "quests", key, QUESTS_TTL_S, async () => {
      // Talent Builder Score runs in parallel with the on-chain scan (never-fail).
      const [data, talentBuilderScore, ownsBasename] = await Promise.all([
        fetchWalletDataChained(addr, req.signal),
        fetchTalentBuilderScore(addr, req.signal),
        fetchOwnsBasename(addr, req.signal),
      ]);
      return computeQuests(data.txs, addr, {
        isSmartWallet: data.usedSmartWallet,
        inboundBridge: data.inboundBridge,
        internalOutTo: data.internalOutTo,
        receivedUsdc: data.receivedUsdc,
        mintedNft: data.mintedNft,
        talentBuilderScore,
        ownsBasename,
      });
    }, fresh);
    return NextResponse.json(result, {
      headers: {
        "cache-control": fresh
          ? "no-store"
          : "public, max-age=30, s-maxage=90",
      },
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

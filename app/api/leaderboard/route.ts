import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { ZSET_KEY } from "@/lib/percentile";

/**
 * Public leaderboard: the top wallets by DropRank score, read from the same
 * Upstash sorted-set that powers the percentile (one entry per scanned address,
 * ZADD-overwritten on rescan). Never throws — returns an empty list when the
 * store is unconfigured or errors, so the UI degrades gracefully.
 */

const TOP_N = 25;

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return NextResponse.json({ entries: [] });
  }

  try {
    const redis = new Redis({ url, token });
    // Highest scores first, with their scores. Flat [member, score, ...].
    const raw = (await redis.zrange(ZSET_KEY, 0, TOP_N - 1, {
      rev: true,
      withScores: true,
    })) as (string | number)[];

    const entries: { address: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({ address: String(raw[i]), score: Number(raw[i + 1]) });
    }

    return NextResponse.json(
      { entries },
      { headers: { "cache-control": "public, max-age=60, s-maxage=120" } },
    );
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { CANARY_PROTOCOLS } from "@/lib/canary-config";
import { findCandidates, passesGate } from "@/lib/canary";
import {
  fetchRecentSwapEntrypoints,
  fetchContractMeta,
} from "@/lib/canary-fetch";
import {
  getExtraRouters,
  addExtraRouter,
  appendAudit,
  getAudit,
} from "@/lib/canary-store";
import { checkRateLimit } from "@/lib/cache";

/**
 * Canary cron — discovers migrated DEX routers and auto-extends the KV
 * allowlist so the matching quest keeps working without a code deploy.
 *
 * For each protocol: sample recent swap entrypoints on its stable anchor pools,
 * gate every distinct UNKNOWN entrypoint (verified source must import the
 * protocol's libs — drops third-party aggregators and unverified bots), and KV-
 * adopt the ones that pass. Every adoption is audited. Mutating; CRON_SECRET-
 * gated. `?status=1` is a read-only view of the allowlist + audit trail.
 */
export const maxDuration = 60;

// Bound work so a busy pool can't blow the function timeout. Sweep is best-
// effort; what isn't reached this run is reached on the next (runs every 12h).
const SAMPLE_TXS = 15; // swaps resolved per anchor pool
const MAX_CANDIDATES = 12; // distinct unknown entrypoints gated per protocol
const FETCH_CONCURRENCY = 4; // keyless Blockscout tolerates a small burst
const DEADLINE_MS = 50_000; // stop before the 60s ceiling; rest caught next run

/**
 * Vercel injects `Authorization: Bearer <CRON_SECRET>` when the env is set.
 * This branch MUTATES the detection allowlist, so unlike the read-only
 * /api/yields it fails CLOSED: an unconfigured secret blocks the run in prod
 * (a misconfigured cron is a bug to surface, not a public mutation endpoint).
 * Dev keeps the open default so the cron is runnable locally without a secret.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Run `fn` over `items` with bounded concurrency, preserving order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function GET(req: NextRequest) {
  // Read-only status: the current KV allowlist + audit trail. No mutation, so
  // it doesn't require the cron secret (only light rate limiting).
  if (req.nextUrl.searchParams.get("status") === "1") {
    if (!(await checkRateLimit(req, { prefix: "canary", limit: 20, windowSeconds: 60 }))) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }
    const [extras, audit] = await Promise.all([getExtraRouters(), getAudit()]);
    return NextResponse.json(
      { extras, audit },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Defense in depth: even with a valid bearer, bound how often the 50s mutating
  // sweep can run (a leaked secret can't be used to burn quota/compute).
  if (!(await checkRateLimit(req, { prefix: "canary-run", limit: 2, windowSeconds: 60 }))) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const ranAt = Date.now();
  const extras = await getExtraRouters();
  const summary: unknown[] = [];

  for (const p of CANARY_PROTOCOLS) {
    if (Date.now() - ranAt > DEADLINE_MS) {
      summary.push({ protocol: p.label, skipped: "deadline; next run" });
      continue;
    }
    if (p.anchorPools.length === 0) {
      summary.push({ protocol: p.label, skipped: "no anchor configured" });
      continue;
    }
    const known = new Set<string>([
      ...p.baseRouters,
      ...(extras[p.questId] ?? []),
    ]);

    // Sample entrypoints across the protocol's anchor pools.
    const perPool = await mapLimit(p.anchorPools, FETCH_CONCURRENCY, (pool) =>
      fetchRecentSwapEntrypoints(pool, SAMPLE_TXS, req.signal),
    );
    const entrypoints = perPool.flat();

    // Gate every distinct unknown entrypoint (frequency only orders the work).
    const candidates = findCandidates(entrypoints, known, 1).slice(0, MAX_CANDIDATES);
    const metas = await mapLimit(candidates, FETCH_CONCURRENCY, (c) =>
      fetchContractMeta(c.addr, req.signal),
    );

    const added: string[] = [];
    for (let k = 0; k < candidates.length; k++) {
      const c = candidates[k];
      if (!passesGate(metas[k], p.libSignatures)) continue;
      if (await addExtraRouter(p.questId, c.addr)) {
        added.push(c.addr);
        await appendAudit({
          at: ranAt,
          kind: "added",
          questId: p.questId,
          addr: c.addr,
          note: `seen x${c.count} on anchor; verified source matches ${p.label}`,
        });
      }
    }

    summary.push({
      protocol: p.label,
      questId: p.questId,
      sampled: entrypoints.length,
      candidates: candidates.length,
      added,
    });
  }

  return NextResponse.json(
    { ranAt, summary },
    { headers: { "cache-control": "no-store" } },
  );
}

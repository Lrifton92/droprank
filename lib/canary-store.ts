/**
 * Canary persistence — the discovered routers and the audit trail, in Upstash.
 *
 * Two durable (no-TTL) keys, separate from the request cache namespace:
 *   droprank:canary:routers  -> Record<questId, string[]>  (the KV allowlist
 *       extras folded into detection by lib/quests.ts via ctx.extraRouters)
 *   droprank:canary:audit    -> AuditEntry[] (most-recent-last, capped)
 *
 * Same project rule as shared-cache.ts: the store is never a hard dependency.
 * A flaky/absent Upstash degrades to "no extras" / "no-op write" so neither the
 * quests API nor the cron ever throws because of Redis.
 */

import { getRedis } from "./shared-cache";

const ROUTERS_KEY = "droprank:canary:routers";
const AUDIT_KEY = "droprank:canary:audit";
const AUDIT_CAP = 100;

export type ExtraRouters = Record<string, string[]>;

export interface AuditEntry {
  /** Unix ms; stamped by the caller (scripts can't call Date.now() safely). */
  at: number;
  /** "added" = router adopted into the allowlist; "review" = gate failed. */
  kind: "added" | "review";
  /** Quest id the candidate belongs to (e.g. "swap-pancakeswap"). */
  questId: string;
  /** The candidate entrypoint address (lowercased). */
  addr: string;
  /** Human note (count seen, gate reason). */
  note: string;
}

const lc = (a: string) => a.toLowerCase();

/**
 * The full per-quest extras map folded into detection. Empty object on a miss,
 * an unconfigured store, or any Redis error — detection then uses the base set.
 */
export async function getExtraRouters(): Promise<ExtraRouters> {
  const client = getRedis();
  if (!client) return {};
  try {
    // Validate SHAPE, not just the root type: this value is folded into the
    // production quest detection for every user, and Redis.get returns arbitrary
    // JSON cast to the type. A malformed entry (a non-array, or non-string items)
    // would otherwise break computeQuests (TypeError on `.includes`) or match by
    // substring. Keep only well-formed `string[]` per quest; drop the rest.
    const v = await client.get<unknown>(ROUTERS_KEY);
    if (!v || typeof v !== "object") return {};
    const out: ExtraRouters = {};
    for (const [questId, list] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(list)) {
        out[questId] = list.filter((x): x is string => typeof x === "string");
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Adopt `addr` into `questId`'s extras (idempotent, lowercased). Returns true if
 * it was newly added, false if already present or the store is unavailable.
 */
export async function addExtraRouter(
  questId: string,
  addr: string,
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  const a = lc(addr);
  try {
    const map = await getExtraRouters();
    const list = map[questId] ?? [];
    if (list.includes(a)) return false;
    map[questId] = [...list, a];
    await client.set(ROUTERS_KEY, map);
    return true;
  } catch {
    return false;
  }
}

/** Append an audit entry, trimming to the most recent AUDIT_CAP. Never throws. */
export async function appendAudit(entry: AuditEntry): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const log = await getAudit();
    const next = [...log, entry].slice(-AUDIT_CAP);
    await client.set(AUDIT_KEY, next);
  } catch {
    // Audit is best-effort observability, never load-bearing.
  }
}

/** The audit trail, most-recent-last. Empty on miss/error. */
export async function getAudit(): Promise<AuditEntry[]> {
  const client = getRedis();
  if (!client) return [];
  try {
    const v = await client.get<AuditEntry[]>(AUDIT_KEY);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

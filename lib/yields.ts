/**
 * Base yields / staking ranking.
 *
 * Fetches DefiLlama's pool list (GET https://yields.llama.fi/pools), keeps only
 * `chain === "Base"`, then for each of three risk profiles (STABLE / MAJORS /
 * DEGEN) applies an eligibility filter and a risk-adjusted score, sorts by score
 * desc and keeps the top 15.
 *
 * Scoring is a faithful, dependency-free TS port of docs/yield-score-spec.md
 * (helpers §2, eligibility §3, formula §4, pipeline §5). The three worked
 * examples of §6 are reproduced to the cent in lib/yields.test.ts.
 *
 * Pure & testable: every scoring function takes a plain pool object, so tests
 * mock inputs inline and never hit the live API (APY moves continuously). The
 * only side effect is the network fetch in `fetchYields`, which honors an
 * AbortSignal and degrades to empty profiles rather than throwing.
 */

import { LruCache } from "./cache";
import { getOrSetCached } from "./shared-cache";

const POOLS_URL = "https://yields.llama.fi/pools";
const PROTOCOLS_URL = "https://api.llama.fi/protocols";
const FETCH_TIMEOUT_MS = 8_000;
const TOP_N = 15;

/**
 * Maps a protocol slug to its OFFICIAL SITE ORIGIN (scheme + host, no path).
 *
 * LEGAL RED LINE: only `new URL(u).origin` is ever stored. Some DefiLlama
 * protocol URLs embed referral/affiliate codes in their path (e.g.
 * https://app.spark.fi/points/KNQ5HD); shipping such a deep link would make
 * DropRank an affiliate and drag it into a regulated perimeter. Origin only,
 * always — the path is dropped here and can never reach the UI.
 */
export type ProtocolUrlMap = Record<string, string>;

// 24h in-memory cache for the per-chain reduced {slug: origin} map (one entry
// per chain slug). getOrSetCached layers Upstash (L2) on top; both degrade to
// recompute on any error (never-fail, like the rest of the file).
const protocolUrlsCache = new LruCache<ProtocolUrlMap>(8, 86_400 * 1000);
const PROTOCOL_URLS_TTL_S = 86_400;

/**
 * Supported chains: UI slug -> { label (UI), chainName (exact `chain` string the
 * DefiLlama pools API uses) }. The API's `chain` field is not always the slug:
 * Optimism is "OP Mainnet", not "Optimism". Verified empirically against
 * yields.llama.fi/pools (TVL>1M): Base 231, Ethereum 1267, OP Mainnet 34,
 * Arbitrum 140. The scoring (formula/filters/profiles, incl. the per-token
 * MAJORS list) is chain-agnostic and reused as-is across all of them.
 */
export const YIELD_CHAINS = {
  base: { label: "Base", chainName: "Base" },
  ethereum: { label: "Ethereum", chainName: "Ethereum" },
  op: { label: "OP Mainnet", chainName: "OP Mainnet" },
  arbitrum: { label: "Arbitrum", chainName: "Arbitrum" },
} as const satisfies Record<string, { label: string; chainName: string }>;

export type ChainSlug = keyof typeof YIELD_CHAINS;

/**
 * Special aggregation slug: not a chain, so it's NOT in YIELD_CHAINS (that map
 * only drives DefiLlama chainName mapping + the per-chain pills). "all" merges
 * the four chains' rankings into one top-15 per profile. The route accepts it
 * alongside the real slugs; it never reaches buildYields/YIELD_CHAINS lookups.
 */
export const ALL_SLUG = "all" as const;
export type AllSlug = typeof ALL_SLUG;

/** True when `slug` is a supported chain (narrows to ChainSlug). */
export function isChainSlug(slug: string): slug is ChainSlug {
  return Object.prototype.hasOwnProperty.call(YIELD_CHAINS, slug);
}

type Profile = "STABLE" | "MAJORS" | "DEGEN";

/** Direction class from DefiLlama's yield-prediction model. */
type PredictedClass = "Down" | "Stable/Up" | "Up";

/**
 * Raw pool shape from yields.llama.fi/pools. Only the fields the spec uses are
 * declared; nullability mirrors §1 (numerics can be null even when present).
 */
export interface RawPool {
  chain: string;
  project: string;
  symbol: string;
  pool: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  stablecoin: boolean;
  ilRisk: "yes" | "no";
  exposure: "single" | "multi";
  apyPct7D: number | null;
  sigma: number;
  predictions?: {
    predictedClass: PredictedClass | null;
    predictedProbability: number | null;
  } | null;
}

/** UI-facing pool card (spec §7). Derived from the raw pool plus the score. */
export interface YieldPool {
  /**
   * The chain this pool lives on. Injected at merge/build time from the dataset
   * being ranked — NEVER read from a cached payload (per-chain payloads cached
   * before this field existed don't carry it; the builder always sets it). The
   * UI uses it only in "all" mode to tag each row with its network.
   */
  chain: ChainSlug;
  /** Protocol slug, e.g. "morpho-blue". */
  project: string;
  /** Token symbol, e.g. "STEAKUSDC". */
  symbol: string;
  /** DefiLlama pool id. */
  pool: string;
  tvlUsd: number;
  /** Total APY (base + reward), %. 0 when the source was null. */
  apy: number;
  /** Organic APY part, %. 0 when null. */
  apyBase: number;
  /** Incentive APY part, %. 0 when null. */
  apyReward: number;
  ilRisk: "yes" | "no";
  exposure: "single" | "multi";
  /** 7-day APY change, %. null when the source gave none. */
  apyPct7D: number | null;
  /** Yield-stability std-dev from DefiLlama. */
  sigma: number;
  predictedClass: PredictedClass | null;
  /** 0..100. null when no prediction. */
  predictedProbability: number | null;
  /** Organic share 0..1 (sustainability). < 0.5 => "reward-driven". */
  sustainability: number;
  /** Risk-adjusted score (raw, spec §4). Rank is by this value. */
  score: number;
  /** DefiLlama pool page. */
  url: string;
  /**
   * Origin of the protocol's OFFICIAL site (e.g. "https://app.spark.fi"), or
   * null when the project could not be resolved. The UI uses this as the
   * primary click target and falls back to `url` (DefiLlama) when null.
   * Origin only — never a deep/affiliate link (see ProtocolUrlMap).
   */
  projectUrl: string | null;
}

export interface YieldsResult {
  /** Which chain this snapshot was computed for ("all" in aggregation mode). */
  chain: { slug: ChainSlug | AllSlug; label: string };
  /** ISO timestamp of when this snapshot was computed. */
  updatedAt: string;
  profiles: {
    stable: YieldPool[];
    majors: YieldPool[];
    degen: YieldPool[];
  };
}

// --- Helpers (spec §2, copied verbatim) -------------------------------------

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

const num = (x: number | null | undefined) =>
  x == null || Number.isNaN(x) ? 0 : x;

/** Organic share of the yield, 0..1 (1 = fully organic). Spec §2.1. */
export function sustainability(p: RawPool): number {
  const apy = num(p.apy);
  if (apy <= 0) return 1;
  if (p.apyBase == null && p.apyReward == null) return 1;
  const base = Math.max(0, num(p.apyBase));
  const reward = Math.max(0, num(p.apyReward));
  const total = base + reward;
  if (total <= 0) return 1;
  return clamp(base / total, 0, 1);
}

/** Yield-volatility factor, 0.2..1. Spec §2.2. */
export function sigmaFactor(p: RawPool): number {
  return clamp(1 / (1 + 0.6 * num(p.sigma)), 0.2, 1);
}

/** Directional prediction factor, 0.6..1.1. Spec §2.3. */
export function predictionFactor(p: RawPool): number {
  const cls = p.predictions?.predictedClass;
  if (!cls) return 1;
  const prob = clamp(num(p.predictions?.predictedProbability) / 100, 0, 1);
  if (cls === "Down") return clamp(1 - 0.4 * prob, 0.6, 1);
  if (cls === "Up" || cls === "Stable/Up") return clamp(1 + 0.1 * prob, 1, 1.1);
  return 1;
}

/** 7-day momentum factor, 0.7..1.1. Spec §2.4. */
export function trendFactor(p: RawPool): number {
  if (p.apyPct7D == null) return 1;
  return clamp(1 + (p.apyPct7D / 100) * 0.15, 0.7, 1.1);
}

/** TVL confidence factor, 0..1 (log-saturating). Spec §2.5. */
export function tvlFactor(p: RawPool, minTvl: number): number {
  const t = Math.max(0, num(p.tvlUsd));
  return clamp(Math.log10(t / minTvl + 1) / Math.log10(20), 0, 1);
}

/** Impermanent-loss penalty. Spec §2.6. */
export function ilPenalty(p: RawPool): number {
  return p.ilRisk === "yes" ? 0.55 : 1;
}

// --- Eligibility (spec §3) --------------------------------------------------

/** Single-asset majors whitelist (case-insensitive exact symbol). Spec §3. */
const MAJORS_RE =
  /^(WETH|ETH|CBBTC|BTC|CBETH|WSTETH|WEETH|RETH|EZETH|TBTC|LBTC|RSETH|WRSETH|MSETH)$/i;

export function eligible(p: RawPool, profile: Profile): boolean {
  const t = num(p.tvlUsd);
  if (profile === "STABLE") {
    return p.stablecoin === true && p.ilRisk === "no" && t >= 500_000;
  }
  if (profile === "MAJORS") {
    return (
      MAJORS_RE.test(p.symbol) &&
      p.exposure === "single" &&
      p.ilRisk === "no" &&
      t >= 1_000_000
    );
  }
  // DEGEN = the rest, with an anti-rug TVL floor.
  return t >= 1_000_000 && !p.stablecoin && !MAJORS_RE.test(p.symbol);
}

// --- Score (spec §4) --------------------------------------------------------

export function yieldScore(p: RawPool, profile: Profile): number {
  // Yield component: log, APY capped at 300% so absurd APYs can't dominate.
  const yieldComp = Math.log10(1 + clamp(num(p.apy), 0, 300));

  let s = yieldComp;
  s *= 0.5 + 0.5 * sustainability(p);
  s *= sigmaFactor(p);
  s *= predictionFactor(p);
  s *= trendFactor(p);

  if (profile === "DEGEN") {
    s *= 0.3 + 0.7 * tvlFactor(p, 1_000_000);
    s *= ilPenalty(p);
  } else {
    s *= tvlFactor(p, 1_000_000);
    s *= ilPenalty(p); // STABLE/MAJORS are ilRisk:no => no-op, kept for robustness.
  }

  return s * 100;
}

// --- Official protocol site resolution --------------------------------------

/** Raw protocol entry from api.llama.fi/protocols (only the used fields). */
interface RawProtocol {
  slug?: string | null;
  url?: string | null;
}

/**
 * Reduce the raw /protocols list to `{slug: origin}`, ENFORCING origin-only.
 *
 * Each protocol's `url` is collapsed to `new URL(u).origin` (no path/query), so
 * any referral code in the path is stripped before it can ever be stored. A
 * missing slug or an unparseable URL drops that protocol silently. Pure.
 */
export function parseProtocols(list: RawProtocol[]): ProtocolUrlMap {
  const out: ProtocolUrlMap = {};
  for (const proto of list) {
    const slug = proto?.slug;
    const u = proto?.url;
    if (!slug || !u) continue;
    try {
      out[slug] = new URL(u).origin;
    } catch {
      // Unparseable URL: skip this protocol (no entry => resolves to null).
    }
  }
  return out;
}

/**
 * Resolve a pool's `project` to its official site origin, or null.
 *
 * Match order (deterministic): exact slug -> prefix slug (the first match in
 * ASCII-ascending slug order, so "spark" -> "sparklend" deterministically) ->
 * null. Returns the origin already stored in `urls` (origin-only by construction
 * via parseProtocols). Pure.
 */
export function resolveProjectUrl(
  project: string,
  urls: ProtocolUrlMap,
): string | null {
  if (urls[project] !== undefined) return urls[project];
  let best: string | null = null;
  for (const slug of Object.keys(urls)) {
    if (slug.startsWith(project) && (best === null || slug < best)) {
      best = slug;
    }
  }
  return best === null ? null : urls[best]!;
}

// --- Pipeline (spec §5) -----------------------------------------------------

/** UI projection of a raw pool, carrying its computed score and official site.
 *  `slug` is the chain being ranked; it's stamped onto the card so "all" mode
 *  can tag the row's network (and single-chain results carry it uniformly). */
function toYieldPool(
  p: RawPool,
  score: number,
  projectUrls: ProtocolUrlMap,
  slug: ChainSlug,
): YieldPool {
  return {
    chain: slug,
    project: p.project,
    symbol: p.symbol,
    pool: p.pool,
    tvlUsd: p.tvlUsd,
    apy: num(p.apy),
    apyBase: num(p.apyBase),
    apyReward: num(p.apyReward),
    ilRisk: p.ilRisk,
    exposure: p.exposure,
    apyPct7D: p.apyPct7D ?? null,
    sigma: p.sigma,
    predictedClass: p.predictions?.predictedClass ?? null,
    predictedProbability: p.predictions?.predictedProbability ?? null,
    sustainability: sustainability(p),
    score,
    url: `https://defillama.com/yields/pool/${p.pool}`,
    projectUrl: resolveProjectUrl(p.project, projectUrls),
  };
}

/**
 * Rank Base pools for one profile: filter by eligibility, score, sort by score
 * desc and keep the top N. `pools` is the already-Base-filtered list.
 *
 * `projectUrls` (default {}) maps protocol slug -> official site origin; unknown
 * projects get projectUrl: null. `slug` (default "base") is stamped onto each
 * card's `chain`. Both optional so existing pure callers/tests run unchanged.
 */
export function rankProfile(
  pools: RawPool[],
  profile: Profile,
  projectUrls: ProtocolUrlMap = {},
  slug: ChainSlug = "base",
): YieldPool[] {
  return pools
    .filter((p) => eligible(p, profile))
    .map((p) => toYieldPool(p, yieldScore(p, profile), projectUrls, slug))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);
}

/**
 * Build the full three-profile result for one chain from a mixed pool list.
 *
 * Filters `pools` to the requested chain (default "base" — keeps the original
 * Base-only callers and tests working unchanged), then ranks each profile. The
 * filter matches the chain's exact API `chain` string (e.g. "OP Mainnet" for
 * slug "op"), so a mixed Base+Ethereum dataset never cross-contaminates. Pure.
 */
export function buildYields(
  pools: RawPool[],
  slug: ChainSlug = "base",
  projectUrls: ProtocolUrlMap = {},
): YieldsResult {
  const { label, chainName } = YIELD_CHAINS[slug];
  const onChain = pools.filter((p) => p.chain === chainName);
  return {
    chain: { slug, label },
    updatedAt: new Date().toISOString(),
    profiles: {
      stable: rankProfile(onChain, "STABLE", projectUrls, slug),
      majors: rankProfile(onChain, "MAJORS", projectUrls, slug),
      degen: rankProfile(onChain, "DEGEN", projectUrls, slug),
    },
  };
}

/**
 * Merge several single-chain results into one aggregated "all networks" result.
 *
 * Each profile's pools are concatenated across chains, re-sorted by score desc
 * and capped to the top N — so a global cross-chain leaderboard, not a per-chain
 * one. Each pool already carries its own `chain` (stamped by buildYields), so the
 * UI can tag networks with zero extra lookup. `updatedAt` is the MAX of the
 * inputs' timestamps (freshest snapshot wins); empty input -> now. Pure.
 */
export function mergeAllYields(results: YieldsResult[]): YieldsResult {
  const top = (key: keyof YieldsResult["profiles"]) =>
    results
      .flatMap((r) => r.profiles[key])
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);
  const updatedAt =
    results.length === 0
      ? new Date().toISOString()
      : results
          .map((r) => r.updatedAt)
          .reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
  return {
    chain: { slug: ALL_SLUG, label: "All networks" },
    updatedAt,
    profiles: {
      stable: top("stable"),
      majors: top("majors"),
      degen: top("degen"),
    },
  };
}

/**
 * Reduce a full {slug: origin} map to ONLY the entries needed to resolve the
 * given distinct project names (the winning exact/prefix match per project).
 *
 * Keeps the cached payload tiny (a handful of protocols) instead of the ~7600
 * upstream entries, while still letting resolveProjectUrl find each project's
 * site. Pure.
 */
function reduceToProjects(
  full: ProtocolUrlMap,
  projects: Iterable<string>,
): ProtocolUrlMap {
  const out: ProtocolUrlMap = {};
  for (const project of projects) {
    if (full[project] !== undefined) {
      out[project] = full[project];
      continue;
    }
    // Mirror resolveProjectUrl's prefix rule to find the winning slug.
    let best: string | null = null;
    for (const slug of Object.keys(full)) {
      if (slug.startsWith(project) && (best === null || slug < best)) {
        best = slug;
      }
    }
    if (best !== null) out[best] = full[best]!;
  }
  return out;
}

/**
 * Fetch /protocols and return the reduced {slug: origin} map for `projects`.
 *
 * Cached 24h via getOrSetCached (L1 in-memory + L2 Upstash) under a per-chain
 * key so two chains never share the wrong project set. Never-fail: any fetch /
 * parse error resolves to {} (projectUrl null everywhere). The stored value is
 * the REDUCED map (only protocols actually referenced by `projects`), not the
 * 7600-entry upstream list.
 */
async function loadProjectUrls(
  cacheKey: string,
  projects: Set<string>,
  signal: AbortSignal,
): Promise<ProtocolUrlMap> {
  return getOrSetCached(
    protocolUrlsCache,
    "yields",
    `protocol-urls:${cacheKey}`,
    PROTOCOL_URLS_TTL_S,
    async () => {
      try {
        const res = await fetch(PROTOCOLS_URL, {
          signal,
          headers: { accept: "application/json" },
        });
        if (!res.ok) return {};
        const body = (await res.json()) as RawProtocol[];
        const full = parseProtocols(Array.isArray(body) ? body : []);
        return reduceToProjects(full, projects);
      } catch {
        return {};
      }
    },
  );
}

/**
 * Fetch DefiLlama pools and return the ranked three-profile result.
 *
 * Honors the caller's AbortSignal (chained to an own timeout). On any network or
 * parse failure it degrades to empty profiles rather than throwing — the route's
 * cache layer must never go down because the upstream API hiccuped.
 */
export async function fetchYields(
  slug: ChainSlug = "base",
  signal?: AbortSignal,
): Promise<YieldsResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(POOLS_URL, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return buildYields([], slug);
    const body = (await res.json()) as { data?: RawPool[] };
    const pools = Array.isArray(body?.data) ? body.data : [];
    // Distinct projects of this chain's pools -> official-site origins (cached,
    // never-fail). buildYields stays pure; the resolved map is injected.
    const chainName = YIELD_CHAINS[slug].chainName;
    const projects = new Set(
      pools.filter((p) => p.chain === chainName).map((p) => p.project),
    );
    const projectUrls = await loadProjectUrls(slug, projects, ctrl.signal);
    return buildYields(pools, slug, projectUrls);
  } catch {
    return buildYields([], slug);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Aggregate all supported chains into one "all networks" result.
 *
 * Fans out to fetchYields per chain (each goes through its OWN L2 cache, so when
 * the chains are warm this is near-free — no extra upstream calls). Uses
 * allSettled so a single chain failing contributes zero pools instead of
 * sinking the whole response. The route does NOT add a dedicated cache layer for
 * "all": this assembles from the four per-chain caches, so a 5th entry would
 * just age out of sync. Never-fail by construction.
 */
export async function fetchAllYields(
  fetchOne: (slug: ChainSlug, signal?: AbortSignal) => Promise<YieldsResult>,
  signal?: AbortSignal,
): Promise<YieldsResult> {
  const slugs = Object.keys(YIELD_CHAINS) as ChainSlug[];
  const settled = await Promise.allSettled(
    slugs.map((slug) => fetchOne(slug, signal)),
  );
  const ok = settled
    .filter((s): s is PromiseFulfilledResult<YieldsResult> => s.status === "fulfilled")
    .map((s) => s.value);
  return mergeAllYields(ok);
}

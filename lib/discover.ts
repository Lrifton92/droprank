import { parseFeed, isBaseRelated, readCapped } from "./news";

/**
 * "New on Base" discovery aggregator.
 *
 * Surfaces recently-launched Base projects/protocols by merging two live sources:
 *  - DefiLlama `/protocols`  -> protocols whose `chains` include "Base", newest by
 *    `listedAt` (unix seconds). Type "protocol".
 *  - Google News search      -> headlines about new launches/deployments on Base.
 *    Type "announced".
 *
 * Robustness mirrors lib/news.ts: each source is fetched under its own timeout,
 * chained to the caller's AbortSignal, and wrapped in Promise.allSettled so a dead
 * or rate-limited source degrades to an empty list instead of throwing the whole
 * aggregate away.
 *
 * Pure helpers are exported via `__test`; the only side effect is the network
 * fetch in `fetchDiscover`.
 */

export interface DiscoverItem {
  type: "protocol" | "announced";
  /** Protocol name or announcement headline. */
  title: string;
  /** External URL: protocol homepage or article link. */
  link: string;
  /** Display source label ("DefiLlama" / "Base News"). */
  source: string;
  /** Unix ms. For protocols: listedAt*1000. For announcements: pubDate. 0 if unknown. */
  date: number;
  /** Protocol category (DefiLlama) — undefined for announcements. */
  category?: string;
  /** Base-chain TVL in USD (DefiLlama) — undefined for announcements. */
  tvl?: number;
}

const SOURCE_TIMEOUT_MS = 5_000;
const ITEM_CAP = 30;
const PROTOCOL_TOP = 15;
const SOURCE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB — /protocols is a few MB of JSON.

const DEFILLAMA_URL = "https://api.llama.fi/protocols";
const GOOGLE_NEWS_URL =
  "https://news.google.com/rss/search?q=(%22launches%20on%20Base%22%20OR%20%22now%20live%20on%20Base%22%20OR%20%22introducing%22%20OR%20%22Base%20mainnet%22%20OR%20%22new%20Base%20protocol%22%20OR%20%22deploys%20on%20Base%22)%20crypto&hl=en-US&gl=US&ceid=US:en";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Shape of a DefiLlama /protocols entry (only the fields we read). */
interface LlamaProtocol {
  name?: unknown;
  url?: unknown;
  category?: unknown;
  chains?: unknown;
  listedAt?: unknown;
  tvl?: unknown;
  chainTvls?: unknown;
}

/**
 * Map DefiLlama's /protocols payload to DiscoverItems.
 *
 * Keeps protocols whose `chains` array includes "Base", sorts by `listedAt`
 * (unix seconds) DESC so the freshest listings come first, and takes the top N.
 *
 * TVL: we prefer `chainTvls.Base` (the protocol's TVL *on Base*) over the global
 * `tvl`, since many multi-chain protocols (e.g. CCIP) report a huge cross-chain
 * total but only a small slice on Base — showing the Base slice is the honest
 * number for a "new on Base" view. Falls back to global `tvl`, then 0.
 *
 * Tolerant: a missing/odd field skips that protocol (or zeroes the TVL) rather
 * than throwing, so a schema drift can't take the source down.
 */
export function parseProtocols(json: unknown, top = PROTOCOL_TOP): DiscoverItem[] {
  if (!Array.isArray(json)) return [];
  const out: DiscoverItem[] = [];
  for (const raw of json as LlamaProtocol[]) {
    if (!raw || typeof raw !== "object") continue;
    const chains = raw.chains;
    if (!Array.isArray(chains) || !chains.includes("Base")) continue;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) continue;
    const url = typeof raw.url === "string" ? raw.url.trim() : "";

    const listedAt =
      typeof raw.listedAt === "number" && Number.isFinite(raw.listedAt)
        ? raw.listedAt
        : 0;

    const baseTvl =
      raw.chainTvls && typeof raw.chainTvls === "object"
        ? (raw.chainTvls as Record<string, unknown>).Base
        : undefined;
    const tvl =
      typeof baseTvl === "number" && Number.isFinite(baseTvl)
        ? baseTvl
        : typeof raw.tvl === "number" && Number.isFinite(raw.tvl)
          ? raw.tvl
          : 0;

    out.push({
      type: "protocol",
      title: name,
      link: url,
      source: "DefiLlama",
      date: listedAt * 1000,
      category: typeof raw.category === "string" ? raw.category : undefined,
      tvl,
    });
  }
  // Newest listings first.
  out.sort((a, b) => b.date - a.date);
  return out.slice(0, top);
}

/**
 * Parse the Google News "new on Base" feed into "announced" DiscoverItems.
 *
 * The query is broad on purpose (high recall) — notably the term "introducing"
 * pulls in lots of non-Base launch PR ("Introducing Worldcoin", "Crypto.com
 * IRAs"...). We therefore run each headline through `isBaseRelated` (shared with
 * lib/news.ts) to drop the off-topic noise: on a live sample this cut 100 raw
 * items down to ~3 genuine Base announcements. Titles arrive as
 * "Headline - Publisher"; we strip the publisher suffix (same regex as news.ts).
 */
export function parseAnnouncements(xml: string): DiscoverItem[] {
  const items = parseFeed(xml, "Base News");
  const out: DiscoverItem[] = [];
  for (const it of items) {
    // parseFeed already strips the "- Publisher" suffix for source "Base News".
    if (!isBaseRelated(it.title, it.description)) continue;
    out.push({
      type: "announced",
      title: it.title,
      link: it.link,
      source: "Base News",
      date: it.date,
    });
  }
  return out;
}

/** Normalize a name for de-dup: lowercase, strip non-alphanumerics, collapse. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalize a URL for de-dup: lowercase host, drop path/query/hash. "" stays "". */
function normalizeUrl(link: string): string {
  if (!link.trim()) return "";
  try {
    const u = new URL(link);
    return u.host.toLowerCase().replace(/^www\./, "");
  } catch {
    return link.trim().toLowerCase();
  }
}

/**
 * Merge protocols + announcements, de-dup, sort and cap.
 *
 * De-dup key: normalized name OR normalized URL host. A protocol and an
 * announcement about the same project (same name or same host) collapse to one,
 * with the protocol kept (it carries category + TVL, the richer card). Among two
 * of the same type, the newer date wins.
 *
 * Order: a single date-DESC sort across both types, so the freshest signal —
 * whether a just-listed protocol or a just-published announcement — leads. This
 * naturally interleaves the two types by recency rather than grouping them.
 */
export function mergeDiscover(
  protocols: DiscoverItem[],
  announcements: DiscoverItem[],
): DiscoverItem[] {
  const byKey = new Map<string, DiscoverItem>();
  const kept = new Set<DiscoverItem>();

  // Protocols first so they win ties on collision (richer card).
  for (const it of [...protocols, ...announcements]) {
    const nameKey = `n:${normalizeName(it.title)}`;
    const urlKey = it.link.trim() ? `u:${normalizeUrl(it.link)}` : "";
    const prior =
      byKey.get(nameKey) ?? (urlKey ? byKey.get(urlKey) : undefined);

    if (prior) {
      // Prefer a protocol over an announcement; else the newer one.
      const winner =
        prior.type === it.type
          ? it.date > prior.date
            ? it
            : prior
          : prior.type === "protocol"
            ? prior
            : it;
      const loser = winner === it ? prior : it;
      kept.delete(loser);
      kept.add(winner);
      byKey.set(nameKey, winner);
      if (urlKey) byKey.set(urlKey, winner);
      byKey.set(`n:${normalizeName(prior.title)}`, winner);
      if (prior.link.trim()) byKey.set(`u:${normalizeUrl(prior.link)}`, winner);
      continue;
    }

    kept.add(it);
    byKey.set(nameKey, it);
    if (urlKey) byKey.set(urlKey, it);
  }

  const merged = Array.from(kept);
  merged.sort((a, b) => b.date - a.date);
  return merged.slice(0, ITEM_CAP);
}

/** Fetch one URL with its own timeout, chained to the caller's AbortSignal. */
async function fetchCapped(
  url: string,
  signal: AbortSignal | undefined,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": UA,
        accept: "application/json, application/rss+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await readCapped(res, SOURCE_MAX_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function fetchProtocols(signal?: AbortSignal): Promise<DiscoverItem[]> {
  const body = await fetchCapped(DEFILLAMA_URL, signal);
  if (body === null) return [];
  try {
    return parseProtocols(JSON.parse(body));
  } catch {
    return [];
  }
}

async function fetchAnnouncements(signal?: AbortSignal): Promise<DiscoverItem[]> {
  const body = await fetchCapped(GOOGLE_NEWS_URL, signal);
  if (body === null) return [];
  return parseAnnouncements(body);
}

/**
 * Fetch both sources in parallel and return the merged "New on Base" list.
 * Never rejects on individual source failures (Promise.allSettled): a dead or
 * rate-limited source simply contributes nothing.
 */
export async function fetchDiscover(signal?: AbortSignal): Promise<DiscoverItem[]> {
  const settled = await Promise.allSettled([
    fetchProtocols(signal),
    fetchAnnouncements(signal),
  ]);
  const [protocols, announcements] = settled.map((s) =>
    s.status === "fulfilled" ? s.value : [],
  ) as [DiscoverItem[], DiscoverItem[]];
  return mergeDiscover(protocols, announcements);
}

/** Internal exports for unit tests only. */
export const __test = { normalizeName, normalizeUrl };

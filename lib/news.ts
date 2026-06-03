import { XMLParser } from "fast-xml-parser";

/**
 * Base news aggregator.
 *
 * Fetches a curated set of crypto RSS feeds in parallel (Promise.allSettled, so a
 * dead feed never blocks the others), parses RSS 2.0 / Atom, keeps only items that
 * are actually about the Base L2, de-dupes, sorts by date desc and caps the list.
 *
 * Pure & testable: parsing and filtering are exported via `__test`. The only side
 * effect is the network fetch in `fetchAllNews`, which honors an AbortSignal.
 *
 * Robustness mirrors the patterns proven on Kore's multi-feed RSS layer:
 * degrade to an empty feed, never throw the whole aggregate away.
 */

export interface NewsItem {
  title: string;
  link: string;
  /** Unix ms. 0 when the feed gave no parseable date. */
  date: number;
  source: string;
  /** Short plain-text snippet (HTML stripped, truncated). May be empty. */
  description: string;
}

export interface NewsFeed {
  /** Display label shown as a badge in the UI. */
  source: string;
  url: string;
  /**
   * When true, every item from this feed is Base-related by construction
   * (the feed itself is a Base-only source) so the keyword filter is skipped.
   */
  baseOnly?: boolean;
}

/**
 * Curated feeds. Each URL was fetched and confirmed to return RSS 2.0 XML on
 * 2026-06-04 (HTTP 200, application/xml or text/xml, standard <item> elements).
 *
 * - Base official blog & Base on Mirror/Paragraph are Base-only -> baseOnly.
 * - The generalist feeds carry the whole crypto firehose; we keyword-filter them.
 */
export const FEEDS: NewsFeed[] = [
  // Base's own engineering/announcement blog (channel title "Base"). All Base.
  { source: "Base", url: "https://blog.base.org/feed", baseOnly: true },
  // Base's Mirror/Paragraph publication. All Base.
  { source: "Base Mirror", url: "https://base.mirror.xyz/feed/atom", baseOnly: true },
  // Generalist crypto press (firehose -> keyword-filtered for Base).
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss" },
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { source: "Decrypt", url: "https://decrypt.co/feed" },
  { source: "The Block", url: "https://www.theblock.co/rss.xml" },
  { source: "The Defiant", url: "https://thedefiant.io/feed" },
];

const FEED_TIMEOUT_MS = 5_000;
const ITEM_CAP = 40;
const DESC_MAX = 240;
// Browser-like UA: the generalist feeds serve any agent, but some hosts gate
// on it. Note: blog.base.org & base.mirror.xyz sit behind Cloudflare bot
// protection that fingerprints at the TLS level and returns 403 to Node's
// fetch (undici) regardless of headers — they work from real browsers/curl but
// not from this runtime. They stay in FEEDS (harmless: a 403 degrades to an
// empty feed) and the generalist feeds carry Base news via the keyword filter.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Base-specific keywords. Two tiers:
 *  - STRONG: terms that are unambiguous on their own (already mention Base/Coinbase
 *    L2 or a Base-native protocol). A title/desc containing one of these qualifies.
 *  - The bare word "base" is intentionally NOT a strong term: it is far too common
 *    ("user base", "cost basis", "based on", "database"...). It only qualifies when
 *    it appears in a Base-L2 phrase (see BASE_PHRASES) or alongside an L2 context word.
 */
const STRONG_KEYWORDS = [
  "coinbase l2",
  "onchain summer",
  "basename",
  "base chain",
  "base network",
  "base mainnet",
  "base l2",
  "base ecosystem",
  "base app",
  "aerodrome",
  "moonwell",
  "base blockchain",
  "built on base",
  "base sepolia",
];

/** Phrases that pin the bare word "base" to the L2 meaning. */
const BASE_PHRASES = [
  /\bbase\b[^.]{0,40}\b(l2|layer\s?2|chain|network|blockchain|mainnet|ecosystem|onchain|defi|tvl|coinbase)\b/i,
  /\b(coinbase|onchain|l2|layer\s?2|tvl|defi)\b[^.]{0,40}\bbase\b/i,
  /\bon base\b/i,
];

/**
 * Decide whether a generalist-feed item is about Base L2.
 *
 * Heuristic (the delicate bit):
 *  1. Any STRONG keyword in title+desc  -> yes.
 *  2. Otherwise, the bare word "base" only counts when it co-occurs with an L2
 *     context word within a short window (BASE_PHRASES), to reject "user base",
 *     "based on", "database", "cost basis", etc.
 *
 * Limits: a headline like "Coinbase launches feature" (the company, not the L2)
 * can slip through via the "coinbase ... base"? No — "coinbase" alone is not a
 * trigger; it only helps when paired with the word "base". The reverse risk is
 * missing an item that calls it "the Base layer-two" with unusual phrasing; we
 * accept a small recall loss to keep precision high (a wrong item is worse than a
 * missing one for a focused Base feed).
 */
export function isBaseRelated(title: string, description: string): boolean {
  const hay = `${title} ${description}`.toLowerCase();
  for (const kw of STRONG_KEYWORDS) {
    if (hay.includes(kw)) return true;
  }
  const raw = `${title} ${description}`;
  return BASE_PHRASES.some((re) => re.test(raw));
}

/** Strip HTML tags & collapse whitespace, then truncate. */
export function cleanText(html: string | undefined, max = DESC_MAX): string {
  if (!html) return "";
  const text = html
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

/** Normalize a URL for de-dup: lowercase host, drop trailing slash, drop query/hash. */
function normalizeLink(link: string): string {
  try {
    const u = new URL(link);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return link.trim().toLowerCase();
  }
}

/** Normalize a title for de-dup: lowercase, strip non-alphanumerics, collapse. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface RawItem {
  title?: string | { "#text"?: string };
  link?: string | { "#text"?: string; "@_href"?: string } | Array<unknown>;
  description?: string | { "#text"?: string };
  summary?: string | { "#text"?: string };
  content?: string | { "#text"?: string };
  pubDate?: string;
  published?: string;
  updated?: string;
  "dc:date"?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  // RSS link is text; Atom link is an attribute. Keep both shapes.
});

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as object)) {
    return String((v as { "#text"?: unknown })["#text"] ?? "");
  }
  return "";
}

/** Atom <link> can be an array of {@_href, @_rel}; pick the alternate/first. */
function linkOf(v: RawItem["link"]): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const arr = v as Array<{ "@_href"?: string; "@_rel"?: string }>;
    const alt = arr.find((l) => l["@_rel"] === "alternate") ?? arr[0];
    return alt?.["@_href"] ?? "";
  }
  const o = v as { "#text"?: string; "@_href"?: string };
  return o["@_href"] ?? o["#text"] ?? "";
}

function dateOf(it: RawItem): number {
  const raw = it.pubDate ?? it.published ?? it.updated ?? it["dc:date"];
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Parse one feed's XML into NewsItems (no Base filtering here — caller filters).
 * Tolerant: handles RSS 2.0 (<rss><channel><item>) and Atom (<feed><entry>).
 * Returns [] on unparseable input rather than throwing.
 */
export function parseFeed(xml: string, source: string): NewsItem[] {
  let doc: unknown;
  try {
    doc = xmlParser.parse(xml);
  } catch {
    return [];
  }
  const d = doc as {
    rss?: { channel?: { item?: RawItem | RawItem[] } };
    feed?: { entry?: RawItem | RawItem[] };
  };
  const rawItems =
    d.rss?.channel?.item ?? d.feed?.entry ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  const out: NewsItem[] = [];
  for (const it of items) {
    if (!it) continue;
    const title = cleanText(textOf(it.title), 200);
    const link = linkOf(it.link).trim();
    if (!title || !link) continue;
    const description = cleanText(
      textOf(it.description) || textOf(it.summary) || textOf(it.content),
    );
    out.push({ title, link, date: dateOf(it), source, description });
  }
  return out;
}

/**
 * De-dupe by normalized title OR normalized link; keep the newest of a group.
 *
 * An item is a duplicate of any already-kept item that shares its title-key OR
 * its link-key. On collision the newer item wins and *replaces* the older one,
 * re-pointing both keys at the winner (so the loser is fully evicted even when
 * the two items differ on the other key).
 */
export function dedupe(items: NewsItem[]): NewsItem[] {
  const byKey = new Map<string, NewsItem>();
  const kept = new Set<NewsItem>();

  for (const it of items) {
    const tKey = `t:${normalizeTitle(it.title)}`;
    const uKey = `u:${normalizeLink(it.link)}`;
    const prior = byKey.get(tKey) ?? byKey.get(uKey);

    if (prior) {
      const winner = it.date > prior.date ? it : prior;
      const loser = winner === it ? prior : it;
      kept.delete(loser);
      kept.add(winner);
      // Point all four keys (winner's + loser's) at the winner.
      byKey.set(tKey, winner);
      byKey.set(uKey, winner);
      byKey.set(`t:${normalizeTitle(prior.title)}`, winner);
      byKey.set(`u:${normalizeLink(prior.link)}`, winner);
      continue;
    }

    kept.add(it);
    byKey.set(tKey, it);
    byKey.set(uKey, it);
  }
  return Array.from(kept);
}

/**
 * Aggregate, filter, dedupe, sort and cap a set of parsed feeds.
 * `baseOnly` feeds bypass the keyword filter. Pure — given raw parsed feeds.
 */
export function aggregate(
  feeds: Array<{ items: NewsItem[]; baseOnly?: boolean }>,
): NewsItem[] {
  const collected: NewsItem[] = [];
  for (const f of feeds) {
    for (const it of f.items) {
      if (f.baseOnly || isBaseRelated(it.title, it.description)) {
        collected.push(it);
      }
    }
  }
  const unique = dedupe(collected);
  unique.sort((a, b) => b.date - a.date);
  return unique.slice(0, ITEM_CAP);
}

/** Fetch one feed with its own timeout, chained to the caller's AbortSignal. */
async function fetchOne(
  feed: NewsFeed,
  signal: AbortSignal | undefined,
): Promise<{ items: NewsItem[]; baseOnly?: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" },
      redirect: "follow",
    });
    if (!res.ok) return { items: [], baseOnly: feed.baseOnly };
    const xml = await res.text();
    return { items: parseFeed(xml, feed.source), baseOnly: feed.baseOnly };
  } catch {
    // Timeout, network error or abort: this feed contributes nothing.
    return { items: [], baseOnly: feed.baseOnly };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Fetch all feeds in parallel and return the aggregated Base news list.
 * Never rejects on individual feed failures (Promise.allSettled): a dead or
 * rate-limited feed simply contributes no items.
 */
export async function fetchAllNews(signal?: AbortSignal): Promise<NewsItem[]> {
  const settled = await Promise.allSettled(
    FEEDS.map((f) => fetchOne(f, signal)),
  );
  const feeds = settled.map((s) =>
    s.status === "fulfilled" ? s.value : { items: [] as NewsItem[] },
  );
  return aggregate(feeds);
}

/** Internal exports for unit tests only. */
export const __test = { normalizeLink, normalizeTitle, dateOf, linkOf, textOf };

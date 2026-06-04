import { XMLParser } from "fast-xml-parser";
import { LruCache } from "./cache";
import { getOrSetCached } from "./shared-cache";

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
  /** Article thumbnail (https). Absent when the feed exposed no usable image. */
  image?: string;
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
  // Google News search aggregating Base coverage from all publishers. The query
  // IS the Base filter, so baseOnly bypasses the keyword pass. High recall, works
  // server-side (no Cloudflare TLS block, unlike blog.base.org/mirror).
  {
    source: "Base News",
    url: "https://news.google.com/rss/search?q=(%22Base%20chain%22%20OR%20%22Base%20network%22%20OR%20%22Base%20L2%22%20OR%20Aerodrome%20OR%20Basenames%20OR%20%22onchain%20summer%22%20OR%20%22Coinbase%20Base%22%20OR%20%22Coinbase%20onchain%22%20OR%20%22Coinbase%20wallet%22%20OR%20%22smart%20wallet%22)%20crypto&hl=en-US&gl=US&ceid=US:en",
    baseOnly: true,
  },
  // Generalist crypto press (firehose -> keyword-filtered for Base). All of the
  // feeds below were fetched on 2026-06-04: HTTP 200, valid RSS, and ~100% of
  // their items carry a feed image (media:content or an <img> in the body), so
  // every Base item they yield arrives with a thumbnail — no og:image scrape
  // needed. This is the lever for image coverage: the Google-News aggregator is
  // image-less by construction, these direct feeds are not.
  // (The Block https://www.theblock.co/rss.xml returns 403 to this runtime and
  //  Blockworks https://blockworks.co/feed exposes no images, so neither is
  //  worth adding.)
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss" },
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { source: "Decrypt", url: "https://decrypt.co/feed" },
  { source: "The Defiant", url: "https://thedefiant.io/feed" },
  { source: "CryptoPotato", url: "https://cryptopotato.com/feed/" },
  { source: "CryptoSlate", url: "https://cryptoslate.com/feed/" },
  { source: "BeInCrypto", url: "https://beincrypto.com/feed/" },
  { source: "NewsBTC", url: "https://www.newsbtc.com/feed/" },
];

const FEED_TIMEOUT_MS = 5_000;
const ITEM_CAP = 40;
const DESC_MAX = 240;
/** Hard cap on a single feed's body to prevent unbounded buffering (re-audit LOW-2). */
const FEED_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Read a response body as text, aborting if it exceeds `maxBytes`. Returns null if over cap. */
export async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const len = Number(res.headers?.get?.("content-length") ?? 0);
  if (len > maxBytes) return null;
  // No streamable body (e.g. test mocks): fall back to buffered text, still capped.
  if (!res.body?.getReader) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(
    chunks.reduce<Uint8Array>((acc, c) => {
      const next = new Uint8Array(acc.length + c.length);
      next.set(acc);
      next.set(c, acc.length);
      return next;
    }, new Uint8Array(0)),
  );
}
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
  // Base/Coinbase onchain ecosystem terms. Each is specific enough to the Base
  // world that it is not a generic-"base" false positive (verified 2026-06-04
  // against the live direct feeds: no leak into non-Base headlines):
  "coinbase onchain",
  "coinbase wallet",
  "smart wallet",
  "farcaster",
  "op stack",
];

/** Phrases that pin the bare word "base" to the L2 meaning. */
const BASE_PHRASES = [
  /\bbase\b[^.]{0,40}\b(l2|layer\s?2|chain|network|blockchain|mainnet|ecosystem|onchain|defi|tvl|coinbase)\b/i,
  /\b(coinbase|onchain|l2|layer\s?2|tvl|defi)\b[^.]{0,40}\bbase\b/i,
  /\bon base\b/i,
  // Title-leading "Base <verb>": when "Base" is the sentence subject of an
  // announcement verb it is unambiguously the L2 (e.g. "Base Launches Azul
  // Upgrade", "Base Adds...", "Base hits 100M tx"). Anchored to start so it
  // never fires on "user base launches" or mid-sentence noise.
  /^base\s+(launch|upgrade|add|ship|hit|reach|surpass|cross|integrat|enabl|expand|roll|introduc|deploy|onboard)/i,
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

/**
 * Normalize a title for de-dup: lowercase, strip non-alphanumerics, collapse,
 * then keep only the first ~60 chars. The prefix match catches the same story
 * republished with a slightly different tail (e.g. Google News appends/rewords
 * the publisher's headline) which a full-title compare would miss.
 */
const TITLE_KEY_LEN = 60;
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, TITLE_KEY_LEN);
}

/** An attribute-bearing media element (or array of them) from fast-xml-parser. */
type MediaNode =
  | { "@_url"?: string; "@_type"?: string; "@_medium"?: string }
  | Array<{ "@_url"?: string; "@_type"?: string; "@_medium"?: string }>;

interface RawItem {
  title?: string | { "#text"?: string };
  link?: string | { "#text"?: string; "@_href"?: string } | Array<unknown>;
  description?: string | { "#text"?: string };
  summary?: string | { "#text"?: string };
  content?: string | { "#text"?: string };
  /** RSS content module: full HTML body, often carries the lead <img>. */
  "content:encoded"?: string | { "#text"?: string };
  /** Media RSS: explicit image element (preferred). */
  "media:content"?: MediaNode;
  "media:thumbnail"?: MediaNode;
  /** RSS enclosure: an attached file; only image/* types are usable. */
  enclosure?: MediaNode;
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
 * Coerce a raw image URL to a safe https thumbnail, or null.
 * Drops protocol-relative ambiguity, upgrades http -> https (mixed-content
 * would be blocked in the webview), and rejects anything not http(s).
 */
function normalizeImage(url: string | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (u.startsWith("https://")) return u;
  if (u.startsWith("http://")) return "https://" + u.slice("http://".length);
  return null;
}

/** First {@_url} of a media node whose type/medium isn't explicitly non-image. */
function imageFromMedia(node: MediaNode | undefined, imageOnly: boolean): string | null {
  if (!node) return null;
  const arr = Array.isArray(node) ? node : [node];
  for (const m of arr) {
    const type = (m["@_type"] ?? "").toLowerCase();
    const medium = (m["@_medium"] ?? "").toLowerCase();
    // For <enclosure>, type MUST be image/*; media:* default to image when unset.
    if (imageOnly && !type.startsWith("image/")) continue;
    if (!imageOnly && (type ? !type.startsWith("image/") : false)) continue;
    if (medium && medium !== "image") continue;
    const url = normalizeImage(m["@_url"]);
    if (url) return url;
  }
  return null;
}

/** First <img src> found in an HTML blob, or null. */
function imageFromHtml(html: string): string | null {
  const m = /<img[^>]+\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
  return m ? normalizeImage(m[1]) : null;
}

/**
 * Extract a thumbnail URL for an item, by priority:
 *   1. media:content / media:thumbnail (explicit image elements)
 *   2. enclosure with an image/* type
 *   3. first <img> inside content:encoded / content / description (raw HTML)
 * http URLs are upgraded to https; anything non-http(s) is dropped. Returns
 * undefined when no usable image exists (the UI then renders without a thumb).
 */
export function extractImage(it: RawItem): string | undefined {
  const fromMedia =
    imageFromMedia(it["media:content"], false) ??
    imageFromMedia(it["media:thumbnail"], false);
  if (fromMedia) return fromMedia;

  const fromEnclosure = imageFromMedia(it.enclosure, true);
  if (fromEnclosure) return fromEnclosure;

  const html =
    textOf(it["content:encoded"]) || textOf(it.content) || textOf(it.description);
  return imageFromHtml(html) ?? undefined;
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
    let title = cleanText(textOf(it.title), 200);
    // Google News titles are "Headline - Publisher"; drop the publisher suffix.
    if (source === "Base News") title = title.replace(/\s[-–—]\s[^-–—]+$/, "").trim();
    const link = linkOf(it.link).trim();
    if (!title || !link) continue;
    const description = cleanText(
      textOf(it.description) || textOf(it.summary) || textOf(it.content),
    );
    const image = extractImage(it);
    out.push({ title, link, date: dateOf(it), source, description, ...(image ? { image } : {}) });
  }
  return out;
}

/**
 * Pick the better of two duplicate items.
 *
 * The Google-News aggregator and the direct publisher feeds often carry the
 * same story under different links, and the aggregator's copy is image-less.
 * So an item that *has* an image always beats one that doesn't (that is the
 * whole point of de-duping across feeds — keep the rich copy). When both or
 * neither carry an image, the newer one wins.
 */
function preferred(a: NewsItem, b: NewsItem): NewsItem {
  const aImg = !!a.image;
  const bImg = !!b.image;
  if (aImg !== bImg) return aImg ? a : b;
  return a.date >= b.date ? a : b;
}

/**
 * De-dupe by normalized title-prefix OR normalized link; keep the best of a group.
 *
 * An item is a duplicate of any already-kept item that shares its title-key OR
 * its link-key. On collision the item *with an image* wins (newest as tie-break)
 * and *replaces* the other, re-pointing both keys at the winner (so the loser is
 * fully evicted even when the two items differ on the other key).
 */
export function dedupe(items: NewsItem[]): NewsItem[] {
  const byKey = new Map<string, NewsItem>();
  const kept = new Set<NewsItem>();

  for (const it of items) {
    const tKey = `t:${normalizeTitle(it.title)}`;
    const uKey = `u:${normalizeLink(it.link)}`;
    const prior = byKey.get(tKey) ?? byKey.get(uKey);

    if (prior) {
      const winner = preferred(it, prior);
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
 *
 * Capping is image-aware: items are sorted by date desc, but when more than
 * ITEM_CAP survive, the cap keeps imaged items first (then the freshest
 * image-less ones backfill the rest). The direct publisher feeds carry images,
 * the Google-News aggregator never does (it has no media element — only a link),
 * so without this an unusually busy news day could push every imaged item out of
 * the cap behind a wall of image-less aggregator items. Within each group the
 * order stays newest-first, so recency is preserved per-group.
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
  if (unique.length <= ITEM_CAP) return unique;
  // Choose WHICH items survive the cap with image priority (imaged kept first,
  // then freshest image-less backfill), but render the survivors newest-first so
  // the UI order stays chronological.
  const imaged = unique.filter((i) => i.image);
  const imageless = unique.filter((i) => !i.image);
  return [...imaged, ...imageless].slice(0, ITEM_CAP).sort((a, b) => b.date - a.date);
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
    // Bound the read so a giant/hostile payload can't be fully buffered (re-audit LOW-2).
    const xml = await readCapped(res, FEED_MAX_BYTES);
    if (xml === null) return { items: [], baseOnly: feed.baseOnly };
    return { items: parseFeed(xml, feed.source), baseOnly: feed.baseOnly };
  } catch {
    // Timeout, network error or abort: this feed contributes nothing.
    return { items: [], baseOnly: feed.baseOnly };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// --- og:image enrichment ----------------------------------------------------
//
// Some feeds (notably the "Base News" Google-News aggregator, ~38/40 items)
// carry NO image in their RSS, so extractImage returns nothing. For those items
// we fetch the article page server-side and scrape its og:image (the social
// preview every publisher sets). This is the only way to get a thumbnail when
// the feed itself exposes none.
//
// Same never-fail discipline as the feed layer: a timeout, block or missing tag
// just leaves the item image-less, never throws.

/** Per-article og:image cache (L1). Resolved URL or the "none" sentinel. */
const ogCache = new LruCache<string>(500, 24 * 60 * 60 * 1000);
/** Sentinel cached for articles with no resolvable og:image (skip re-fetch). */
const OG_NONE = "none";
const OG_TTL_S = 86_400;
const OG_TIMEOUT_MS = 2_500;
/** Max concurrent article fetches during one enrichment pass. */
const OG_CONCURRENCY = 8;
/** og: scraping only needs the <head>; cap the read so we never buffer a page. */
const OG_MAX_BYTES = 50 * 1024;

/** FNV-1a 32-bit hash -> short hex. Stable cache key from an article link. */
function hashLink(link: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < link.length; i++) {
    h ^= link.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * Pull og:image (preferred) or twitter:image from an HTML <head> blob.
 * Tolerant of attribute order (content before/after property) and quote style.
 * Returns a normalized https URL, or undefined.
 */
export function extractOgImage(html: string): string | undefined {
  const head = html.slice(0, OG_MAX_BYTES);
  const find = (key: string): string | null => {
    // property|name = "<key>" with content="..." in either attribute order.
    const after =
      new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*?\\bcontent\\s*=\\s*["']([^"']+)["']`,
        "i",
      ).exec(head);
    if (after) return after[1] ?? null;
    const before =
      new RegExp(
        `<meta[^>]+\\bcontent\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name)\\s*=\\s*["']${key}["']`,
        "i",
      ).exec(head);
    return before ? before[1] ?? null : null;
  };
  const raw = find("og:image") ?? find("twitter:image");
  return normalizeImage(raw ?? undefined) ?? undefined;
}

/** Fetch one article and scrape its og:image; never throws. Returns OG_NONE on any miss. */
async function fetchOgImage(link: string, signal: AbortSignal | undefined): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OG_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(link, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
    });
    if (!res.ok) return OG_NONE;
    const html = await readCapped(res, OG_MAX_BYTES * 4);
    if (html === null) return OG_NONE;
    return extractOgImage(html) ?? OG_NONE;
  } catch {
    return OG_NONE;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Fill in `image` for items that have none, by scraping each article's og:image.
 * Results (URL or the "none" sentinel) are cached per-article for 24h via the
 * shared L1+Redis cache, so a given article is fetched at most once a day even
 * though the feed itself refreshes every 15 min. Runs OG_CONCURRENCY at a time.
 */
async function enrichWithOgImages(items: NewsItem[], signal: AbortSignal | undefined): Promise<NewsItem[]> {
  const todo = items.filter((it) => !it.image);
  if (todo.length === 0) return items;

  const resolved = new Map<string, string>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < todo.length) {
      const it = todo[cursor++]!;
      const value = await getOrSetCached(
        ogCache,
        "news",
        `og:${hashLink(it.link)}`,
        OG_TTL_S,
        () => fetchOgImage(it.link, signal),
      );
      resolved.set(it.link, value);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(OG_CONCURRENCY, todo.length) }, () => worker()),
  );

  return items.map((it) => {
    if (it.image) return it;
    const og = resolved.get(it.link);
    return og && og !== OG_NONE ? { ...it, image: og } : it;
  });
}

/**
 * Fetch all feeds in parallel and return the aggregated Base news list.
 * Never rejects on individual feed failures (Promise.allSettled): a dead or
 * rate-limited feed simply contributes no items. Items that arrive without a
 * feed image are enriched server-side with their article's og:image.
 */
export async function fetchAllNews(signal?: AbortSignal): Promise<NewsItem[]> {
  const settled = await Promise.allSettled(
    FEEDS.map((f) => fetchOne(f, signal)),
  );
  const feeds = settled.map((s) =>
    s.status === "fulfilled" ? s.value : { items: [] as NewsItem[] },
  );
  return enrichWithOgImages(aggregate(feeds), signal);
}

/** Internal exports for unit tests only. */
export const __test = { normalizeLink, normalizeTitle, dateOf, linkOf, textOf };

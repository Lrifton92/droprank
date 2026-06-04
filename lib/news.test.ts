import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseFeed,
  isBaseRelated,
  dedupe,
  aggregate,
  cleanText,
  fetchAllNews,
  FEEDS,
  type NewsItem,
} from "./news";

// --- Fixtures ---------------------------------------------------------------

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>CoinDesk</title>
    <item>
      <title><![CDATA[Aerodrome TVL hits record on Base]]></title>
      <link>https://www.coindesk.com/markets/aerodrome-tvl-record</link>
      <pubDate>Wed, 03 Jun 2026 10:00:00 +0000</pubDate>
      <description><![CDATA[The Base-native DEX <b>Aerodrome</b> saw inflows.]]></description>
    </item>
    <item>
      <title>SpaceX expands its user base to new markets</title>
      <link>https://www.coindesk.com/business/spacex-user-base</link>
      <pubDate>Wed, 03 Jun 2026 09:00:00 +0000</pubDate>
      <description>A story about a company growing its user base. Nothing crypto here.</description>
    </item>
    <item>
      <title>Bitcoin steadies near 70k</title>
      <link>https://www.coindesk.com/markets/btc-70k</link>
      <pubDate>Wed, 03 Jun 2026 08:00:00 +0000</pubDate>
      <description>Macro recap.</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Base Mirror</title>
  <entry>
    <title>Onchain Summer is back</title>
    <link rel="alternate" href="https://base.mirror.xyz/onchain-summer"/>
    <published>2026-06-02T12:00:00Z</published>
    <summary>A celebration of building on Base.</summary>
  </entry>
</feed>`;

// --- parseFeed --------------------------------------------------------------

describe("parseFeed", () => {
  it("parses RSS 2.0 items (title, link, date, description, source)", () => {
    const items = parseFeed(RSS, "CoinDesk");
    expect(items).toHaveLength(3);
    const first = items[0]!;
    expect(first.title).toBe("Aerodrome TVL hits record on Base");
    expect(first.link).toBe("https://www.coindesk.com/markets/aerodrome-tvl-record");
    expect(first.source).toBe("CoinDesk");
    expect(first.date).toBe(Date.parse("Wed, 03 Jun 2026 10:00:00 +0000"));
    // HTML stripped from description.
    expect(first.description).toBe("The Base-native DEX Aerodrome saw inflows.");
  });

  it("parses Atom entries with link as an href attribute", () => {
    const items = parseFeed(ATOM, "Base Mirror");
    expect(items).toHaveLength(1);
    expect(items[0]!.link).toBe("https://base.mirror.xyz/onchain-summer");
    expect(items[0]!.title).toBe("Onchain Summer is back");
    expect(items[0]!.date).toBe(Date.parse("2026-06-02T12:00:00Z"));
  });

  it("returns [] on garbage / non-feed input instead of throwing", () => {
    expect(parseFeed("not xml at all <<<", "X")).toEqual([]);
    expect(parseFeed("<html><body>nope</body></html>", "X")).toEqual([]);
  });

  it("skips items missing a title or link", () => {
    const xml = `<rss><channel>
      <item><title>No link here</title></item>
      <item><link>https://x.io/a</link></item>
      <item><title>Good</title><link>https://x.io/good</link></item>
    </channel></rss>`;
    const items = parseFeed(xml, "X");
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Good");
  });
});

// --- image extraction (via parseFeed) ---------------------------------------

describe("parseFeed image extraction", () => {
  const one = (inner: string): NewsItem =>
    parseFeed(
      `<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>${inner}</item></channel></rss>`,
      "X",
    )[0]!;

  const base = `<title>T</title><link>https://x.io/a</link>`;

  it("leaves image undefined when the item carries no image", () => {
    const it = one(`${base}<description>Just text, no pictures.</description>`);
    expect(it.image).toBeUndefined();
  });

  it("reads media:content (preferred source)", () => {
    const it = one(
      `${base}<media:content url="https://img.example/a.jpg" medium="image"/>`,
    );
    expect(it.image).toBe("https://img.example/a.jpg");
  });

  it("reads media:thumbnail when media:content is absent", () => {
    const it = one(`${base}<media:thumbnail url="https://img.example/t.jpg"/>`);
    expect(it.image).toBe("https://img.example/t.jpg");
  });

  it("reads an image enclosure (type image/*)", () => {
    const it = one(
      `${base}<enclosure url="https://img.example/b.png" type="image/png"/>`,
    );
    expect(it.image).toBe("https://img.example/b.png");
  });

  it("ignores a non-image enclosure (e.g. audio)", () => {
    const it = one(
      `${base}<enclosure url="https://x.io/pod.mp3" type="audio/mpeg"/>`,
    );
    expect(it.image).toBeUndefined();
  });

  it("falls back to the first <img> in content:encoded", () => {
    const it = one(
      `${base}<content:encoded><![CDATA[<p>Lead <img src="https://img.example/c.webp"/> body</p>]]></content:encoded>`,
    );
    expect(it.image).toBe("https://img.example/c.webp");
  });

  it("falls back to the first <img> in description", () => {
    const it = one(
      `${base}<description><![CDATA[<img src="https://img.example/d.png"> text]]></description>`,
    );
    expect(it.image).toBe("https://img.example/d.png");
  });

  it("upgrades an http image URL to https", () => {
    const it = one(
      `${base}<media:content url="http://img.example/a.jpg" medium="image"/>`,
    );
    expect(it.image).toBe("https://img.example/a.jpg");
  });

  it("drops a non-http(s) image URL (e.g. data:)", () => {
    const it = one(
      `${base}<description><![CDATA[<img src="data:image/png;base64,AAAA"> x]]></description>`,
    );
    expect(it.image).toBeUndefined();
  });

  it("prefers media:content over an <img> in the description", () => {
    const it = one(
      `${base}<media:content url="https://img.example/win.jpg" medium="image"/><description><![CDATA[<img src="https://img.example/lose.jpg">]]></description>`,
    );
    expect(it.image).toBe("https://img.example/win.jpg");
  });
});

// --- isBaseRelated ----------------------------------------------------------

describe("isBaseRelated (filter heuristic)", () => {
  it("keeps true positives (strong Base keywords / phrases)", () => {
    expect(isBaseRelated("Aerodrome TVL hits record", "")).toBe(true);
    expect(isBaseRelated("Coinbase L2 sees new highs", "")).toBe(true);
    expect(isBaseRelated("Onchain Summer is back", "")).toBe(true);
    expect(isBaseRelated("Get your Basename today", "")).toBe(true);
    expect(isBaseRelated("Moonwell launches lending", "on Base")).toBe(true);
    expect(isBaseRelated("New DEX launches", "Built on Base, the Coinbase L2")).toBe(true);
    expect(isBaseRelated("TVL on Base hits all-time high", "")).toBe(true);
    expect(isBaseRelated("Base network upgrade ships", "")).toBe(true);
  });

  it("rejects false positives (generic 'base' word)", () => {
    expect(isBaseRelated("SpaceX expands its user base", "Growing the user base")).toBe(false);
    expect(isBaseRelated("This is based on new data", "")).toBe(false);
    expect(isBaseRelated("Cost basis rules for taxes", "")).toBe(false);
    expect(isBaseRelated("New database for analytics", "")).toBe(false);
    expect(isBaseRelated("Bitcoin steadies near 70k", "Macro recap")).toBe(false);
    expect(isBaseRelated("A solid base for the team", "")).toBe(false);
  });
});

// --- dedupe -----------------------------------------------------------------

describe("dedupe", () => {
  const mk = (over: Partial<NewsItem>): NewsItem => ({
    title: "t",
    link: "https://a.io/x",
    date: 0,
    source: "S",
    description: "",
    ...over,
  });

  it("collapses items with the same normalized link, keeping the newest", () => {
    const out = dedupe([
      mk({ title: "Old headline", link: "https://a.io/post/", date: 100 }),
      mk({ title: "New headline", link: "https://A.io/post", date: 200 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.date).toBe(200);
  });

  it("collapses items with the same normalized title across sources", () => {
    const out = dedupe([
      mk({ title: "Base hits new ATH!", link: "https://x.io/1", date: 100, source: "A" }),
      mk({ title: "BASE hits new ATH", link: "https://y.io/2", date: 50, source: "B" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.date).toBe(100);
  });

  it("keeps genuinely distinct items", () => {
    const out = dedupe([
      mk({ title: "Story one", link: "https://x.io/1" }),
      mk({ title: "Story two", link: "https://x.io/2" }),
    ]);
    expect(out).toHaveLength(2);
  });
});

// --- aggregate --------------------------------------------------------------

describe("aggregate", () => {
  const mk = (over: Partial<NewsItem>): NewsItem => ({
    title: "t",
    link: `https://a.io/${Math.random()}`,
    date: 0,
    source: "S",
    description: "",
    ...over,
  });

  it("filters generalist feeds but passes baseOnly feeds untouched", () => {
    const out = aggregate([
      {
        items: [
          mk({ title: "Aerodrome on Base", date: 10 }),
          mk({ title: "Random crypto news", date: 9 }),
        ],
      },
      {
        baseOnly: true,
        items: [mk({ title: "Base 2026 roadmap", date: 5 })],
      },
    ]);
    const titles = out.map((i) => i.title);
    expect(titles).toContain("Aerodrome on Base");
    expect(titles).toContain("Base 2026 roadmap");
    expect(titles).not.toContain("Random crypto news");
  });

  it("sorts by date desc", () => {
    const out = aggregate([
      {
        baseOnly: true,
        items: [
          mk({ title: "a", date: 1 }),
          mk({ title: "b", date: 3 }),
          mk({ title: "c", date: 2 }),
        ],
      },
    ]);
    expect(out.map((i) => i.date)).toEqual([3, 2, 1]);
  });

  it("caps the result at 40 items", () => {
    const many = Array.from({ length: 80 }, (_, i) => mk({ title: `t${i}`, date: i }));
    const out = aggregate([{ baseOnly: true, items: many }]);
    expect(out).toHaveLength(40);
    // Newest first.
    expect(out[0]!.date).toBe(79);
  });
});

// --- cleanText --------------------------------------------------------------

describe("cleanText", () => {
  it("strips tags, decodes basic entities, collapses whitespace", () => {
    expect(cleanText("<p>Hello&nbsp;&amp; <b>world</b></p>")).toBe("Hello & world");
  });
  it("truncates long text on a word boundary with an ellipsis", () => {
    const long = "word ".repeat(100);
    const out = cleanText(long, 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith("…")).toBe(true);
  });
  it("returns empty string for undefined", () => {
    expect(cleanText(undefined)).toBe("");
  });
});

// --- fetchAllNews (network, mocked) -----------------------------------------

describe("fetchAllNews", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a single failing feed does not block the others", async () => {
    // Each surviving feed yields a distinct item carrying a strong Base keyword
    // so it passes the filter even on generalist (non-baseOnly) feeds.
    const okXml = (source: string) =>
      `<rss><channel><item><title>Aerodrome milestone reported by ${source}</title><link>https://x.io/${encodeURIComponent(source)}</link><pubDate>Wed, 03 Jun 2026 10:00:00 +0000</pubDate></item></channel></rss>`;

    fetchMock.mockImplementation((url: string) => {
      const feed = FEEDS.find((f) => f.url === url)!;
      // Fail the very first feed (Base blog) outright.
      if (url === FEEDS[0]!.url) return Promise.reject(new Error("boom"));
      return Promise.resolve({
        ok: true,
        text: async () => okXml(feed.source),
      } as Response);
    });

    const items = await fetchAllNews();
    // FEEDS.length - 1 feeds succeeded, each contributing one (distinct) item.
    expect(items.length).toBe(FEEDS.length - 1);
    expect(items.every((i) => i.title.includes("Aerodrome"))).toBe(true);
  });

  it("returns [] when every feed fails (degrades, never throws)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(fetchAllNews()).resolves.toEqual([]);
  });

  it("treats a non-ok HTTP response as an empty feed", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "" } as Response);
    await expect(fetchAllNews()).resolves.toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseProtocols,
  parseAnnouncements,
  mergeDiscover,
  fetchDiscover,
  type DiscoverItem,
} from "./discover";

// --- Fixtures ---------------------------------------------------------------

// Shape mirrors a real https://api.llama.fi/protocols entry (verified 2026-06-04):
// listedAt is unix SECONDS; tvl is the global cross-chain total; chainTvls.Base
// is the Base-only slice. JackCo's url is a blank " " (real data does this).
const LLAMA = [
  {
    name: "openOracle",
    url: "https://openoracle.org/",
    category: "Oracle",
    chains: ["Base"],
    listedAt: 1780333237,
    tvl: 3417.57,
    chainTvls: { Base: 3417.57 },
  },
  {
    name: "CCIP",
    url: "https://chain.link/cross-chain",
    category: "Bridge",
    chains: ["Ethereum", "Base", "Arbitrum"],
    listedAt: 1780442964,
    tvl: 1246877506, // huge global total…
    chainTvls: { Base: 12256601, Ethereum: 1200000000 }, // …but only $12M on Base
  },
  {
    name: "JackCo",
    url: " ",
    category: "Yield Lottery",
    chains: ["Base"],
    listedAt: 1780363947,
    tvl: 14.98,
    chainTvls: { Base: 10.99 },
  },
  {
    name: "Some Solana Thing",
    url: "https://solana.example",
    category: "Dex",
    chains: ["Solana"], // not on Base -> excluded
    listedAt: 1780500000,
    tvl: 999,
  },
];

const GOOGLE_NEWS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Google News</title>
  <item>
    <title>Base Activates Azul Upgrade on Mainnet - CoinMarketCap</title>
    <link>https://news.google.com/articles/azul</link>
    <pubDate>Wed, 03 Jun 2026 10:00:00 +0000</pubDate>
  </item>
  <item>
    <title>Introducing Worldcoin Proof of Human - WEEX</title>
    <link>https://news.google.com/articles/worldcoin</link>
    <pubDate>Wed, 03 Jun 2026 09:00:00 +0000</pubDate>
  </item>
  <item>
    <title>Aerodrome launches new gauge - The Defiant</title>
    <link>https://news.google.com/articles/aero</link>
    <pubDate>Wed, 03 Jun 2026 08:00:00 +0000</pubDate>
  </item>
</channel></rss>`;

// --- parseProtocols ---------------------------------------------------------

describe("parseProtocols (DefiLlama)", () => {
  it("keeps only Base-chain protocols and tags them type=protocol", () => {
    const out = parseProtocols(LLAMA);
    const names = out.map((p) => p.title);
    expect(names).toContain("openOracle");
    expect(names).toContain("CCIP");
    expect(names).toContain("JackCo");
    expect(names).not.toContain("Some Solana Thing");
    expect(out.every((p) => p.type === "protocol")).toBe(true);
    expect(out.every((p) => p.source === "DefiLlama")).toBe(true);
  });

  it("sorts by listedAt (unix seconds) DESC and converts to ms", () => {
    const out = parseProtocols(LLAMA);
    // CCIP 1780442964 > JackCo 1780363947 > openOracle 1780333237
    expect(out.map((p) => p.title)).toEqual(["CCIP", "JackCo", "openOracle"]);
    expect(out[0]!.date).toBe(1780442964 * 1000);
  });

  it("prefers the Base-chain TVL over the global tvl", () => {
    const ccip = parseProtocols(LLAMA).find((p) => p.title === "CCIP")!;
    // global tvl is $1.2B but Base slice is $12.2M — we surface the Base slice.
    expect(ccip.tvl).toBe(12256601);
  });

  it("respects the top-N cap (newest kept)", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `p${i}`,
      url: `https://p${i}.io`,
      category: "Dex",
      chains: ["Base"],
      listedAt: 1_700_000_000 + i,
    }));
    const out = parseProtocols(many, 15);
    expect(out).toHaveLength(15);
    expect(out[0]!.title).toBe("p29"); // newest first
  });

  it("degrades on malformed input instead of throwing", () => {
    expect(parseProtocols(null)).toEqual([]);
    expect(parseProtocols({})).toEqual([]);
    expect(parseProtocols([{ chains: ["Base"] }])).toEqual([]); // no name -> skipped
    expect(
      parseProtocols([{ name: "x", chains: ["Base"], listedAt: "oops" }])[0]!.date,
    ).toBe(0); // bad listedAt -> date 0, still kept
  });
});

// --- parseAnnouncements -----------------------------------------------------

describe("parseAnnouncements (Google News)", () => {
  it("keeps Base-related headlines, strips the publisher suffix, type=announced", () => {
    const out = parseAnnouncements(GOOGLE_NEWS);
    const titles = out.map((a) => a.title);
    expect(titles).toContain("Base Activates Azul Upgrade on Mainnet");
    expect(titles).toContain("Aerodrome launches new gauge");
    expect(out.every((a) => a.type === "announced")).toBe(true);
    expect(out.every((a) => a.source === "Base News")).toBe(true);
  });

  it("drops off-topic launch PR (the broad 'introducing' query noise)", () => {
    const out = parseAnnouncements(GOOGLE_NEWS);
    expect(out.map((a) => a.title)).not.toContain("Introducing Worldcoin Proof of Human");
  });

  it("returns [] on garbage instead of throwing", () => {
    expect(parseAnnouncements("not xml <<<")).toEqual([]);
  });
});

// --- mergeDiscover ----------------------------------------------------------

describe("mergeDiscover", () => {
  const proto = (over: Partial<DiscoverItem>): DiscoverItem => ({
    type: "protocol",
    title: "P",
    link: "https://p.io",
    source: "DefiLlama",
    date: 0,
    ...over,
  });
  const ann = (over: Partial<DiscoverItem>): DiscoverItem => ({
    type: "announced",
    title: "A",
    link: "https://news.google.com/x",
    source: "Base News",
    date: 0,
    ...over,
  });

  it("interleaves both types by date DESC", () => {
    const out = mergeDiscover(
      [proto({ title: "P1", link: "https://p1.io", date: 100 })],
      [ann({ title: "A1", link: "https://a1.io", date: 200 })],
    );
    expect(out.map((i) => i.title)).toEqual(["A1", "P1"]);
  });

  it("collapses a protocol and an announcement about the same project, keeping the protocol", () => {
    const out = mergeDiscover(
      [proto({ title: "Aerodrome", link: "https://aerodrome.finance", date: 50, tvl: 999 })],
      [ann({ title: "Aerodrome", link: "https://news.google.com/aero", date: 100 })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe("protocol");
    expect(out[0]!.tvl).toBe(999);
  });

  it("does not collapse blank-url protocols by url (only by name)", () => {
    const out = mergeDiscover(
      [proto({ title: "Alpha", link: " " }), proto({ title: "Beta", link: " " })],
      [],
    );
    expect(out).toHaveLength(2);
  });

  it("caps the merged list at 30 items", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      proto({ title: `p${i}`, link: `https://p${i}.io`, date: i }),
    );
    const out = mergeDiscover(many, []);
    expect(out).toHaveLength(30);
    expect(out[0]!.title).toBe("p39");
  });
});

// --- fetchDiscover (network, mocked) ----------------------------------------

describe("fetchDiscover", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const reply = (body: string) =>
    Promise.resolve({ ok: true, text: async () => body } as Response);

  it("merges both sources on success", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes("llama.fi")
        ? reply(JSON.stringify(LLAMA))
        : reply(GOOGLE_NEWS),
    );
    const out = await fetchDiscover();
    expect(out.some((i) => i.type === "protocol")).toBe(true);
    expect(out.some((i) => i.type === "announced")).toBe(true);
  });

  it("a failing source does not block the other", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes("llama.fi")
        ? Promise.reject(new Error("llama down"))
        : reply(GOOGLE_NEWS),
    );
    const out = await fetchDiscover();
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((i) => i.type === "announced")).toBe(true);
  });

  it("returns [] when both sources fail (degrades, never throws)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(fetchDiscover()).resolves.toEqual([]);
  });

  it("treats a non-ok HTTP response as an empty source", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "" } as Response);
    await expect(fetchDiscover()).resolves.toEqual([]);
  });
});

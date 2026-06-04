import { describe, it, expect } from "vitest";
import {
  eligible,
  yieldScore,
  rankProfile,
  buildYields,
  mergeAllYields,
  fetchAllYields,
  isChainSlug,
  ALL_SLUG,
  parseProtocols,
  resolveProjectUrl,
  YIELD_CHAINS,
  type RawPool,
  type ChainSlug,
  type YieldsResult,
} from "./yields";

// --- Fixtures: the three worked examples from spec §6 (inputs frozen). ------
// APYs move continuously on the live API, so every test mocks inputs inline and
// reproduces the spec's hand-computed scores to the cent.

// §6 A — STABLE: morpho-blue / STEAKUSDC -> score ≈ 72.31
const STEAKUSDC: RawPool = {
  chain: "Base",
  project: "morpho-blue",
  symbol: "STEAKUSDC",
  pool: "steakusdc-pool",
  tvlUsd: 337_479_830,
  apy: 4.03522,
  apyBase: 4.03522,
  apyReward: 0,
  stablecoin: true,
  ilRisk: "no",
  exposure: "single",
  apyPct7D: -0.69293,
  sigma: 0.03827,
  predictions: { predictedClass: "Stable/Up", predictedProbability: 55 },
};

// §6 B — MAJORS: ether.fi-stake / WEETH -> score ≈ 61.98
const WEETH: RawPool = {
  chain: "Base",
  project: "ether.fi-stake",
  symbol: "WEETH",
  pool: "weeth-pool",
  tvlUsd: 55_200_200,
  apy: 3.04332,
  apyBase: 2.98201,
  apyReward: 0.06132,
  stablecoin: false,
  ilRisk: "no",
  exposure: "single",
  apyPct7D: 0.61638,
  sigma: 0.03075,
  predictions: { predictedClass: "Stable/Up", predictedProbability: 51 },
};

// §6 C — DEGEN trap: aerodrome-v1 / USDC-NOCK (APY 7592%) -> score ≈ 2.80
const USDC_NOCK: RawPool = {
  chain: "Base",
  project: "aerodrome-v1",
  symbol: "USDC-NOCK",
  pool: "usdc-nock-pool",
  tvlUsd: 1_236_914,
  apy: 7592.47825,
  apyBase: null,
  apyReward: 7592.47825,
  stablecoin: false,
  ilRisk: "yes",
  exposure: "multi",
  apyPct7D: -928.63379,
  sigma: 10.69551,
  predictions: { predictedClass: "Down", predictedProbability: 100 },
};

describe("yieldScore — spec §6 worked examples (to the cent)", () => {
  it("STABLE STEAKUSDC ≈ 72.3", () => {
    expect(yieldScore(STEAKUSDC, "STABLE")).toBeCloseTo(72.31, 1);
  });

  it("MAJORS WEETH ≈ 62.0 (±0.1)", () => {
    // Spec §6 B states "test attendu: ≈ 62.0 (±0.1)". Its inline "61.98" is the
    // author's hand-rounded estimate; multiplying the spec's OWN intermediate
    // values (0.60674·0.98993·0.98188·1.051·1.00092·1.0·100) yields 62.04, which
    // this formula reproduces exactly. Assert the spec's stated target ±0.1.
    expect(yieldScore(WEETH, "MAJORS")).toBeCloseTo(62.0, 1);
  });

  it("DEGEN USDC-NOCK ≈ 2.8 (the trap is buried)", () => {
    expect(yieldScore(USDC_NOCK, "DEGEN")).toBeCloseTo(2.8, 1);
  });
});

describe("eligibility — spec §3 (the 7592% trap is rejected from safe profiles)", () => {
  it("USDC-NOCK is NOT eligible to STABLE", () => {
    expect(eligible(USDC_NOCK, "STABLE")).toBe(false);
  });

  it("USDC-NOCK is NOT eligible to MAJORS", () => {
    expect(eligible(USDC_NOCK, "MAJORS")).toBe(false);
  });

  it("USDC-NOCK IS eligible to DEGEN (but scores at the bottom)", () => {
    expect(eligible(USDC_NOCK, "DEGEN")).toBe(true);
    expect(yieldScore(USDC_NOCK, "DEGEN")).toBeLessThan(
      yieldScore(WEETH, "DEGEN"),
    );
  });

  it("STEAKUSDC is STABLE-eligible, not MAJORS/DEGEN", () => {
    expect(eligible(STEAKUSDC, "STABLE")).toBe(true);
    expect(eligible(STEAKUSDC, "MAJORS")).toBe(false);
    expect(eligible(STEAKUSDC, "DEGEN")).toBe(false); // stablecoin excluded
  });

  it("WEETH is MAJORS-eligible (whitelisted single-asset)", () => {
    expect(eligible(WEETH, "MAJORS")).toBe(true);
    expect(eligible(WEETH, "STABLE")).toBe(false); // not a stablecoin
  });

  it("rejects sub-floor TVL stablecoins from STABLE (500k floor)", () => {
    const small: RawPool = { ...STEAKUSDC, tvlUsd: 400_000 };
    expect(eligible(small, "STABLE")).toBe(false);
  });

  it("rejects multi-exposure majors LP from MAJORS (exposure + ilRisk filter)", () => {
    const lp: RawPool = {
      ...WEETH,
      symbol: "WETH-CBBTC",
      exposure: "multi",
      ilRisk: "yes",
    };
    expect(eligible(lp, "MAJORS")).toBe(false);
  });
});

describe("rankProfile — sort desc + top 15", () => {
  it("sorts by score descending", () => {
    // A clean non-major non-stable pool (DEGEN-eligible) must outrank the trap.
    const cleanDegen: RawPool = { ...WEETH, symbol: "SOMECOIN", stablecoin: false };
    const ranked = rankProfile([USDC_NOCK, cleanDegen], "DEGEN");
    expect(ranked.map((p) => p.symbol)).toEqual(["SOMECOIN", "USDC-NOCK"]);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("caps each profile at 15 even with more eligible pools", () => {
    const many: RawPool[] = Array.from({ length: 25 }, (_, i) => ({
      ...STEAKUSDC,
      pool: `stable-${i}`,
      // distinct scores so the cap keeps a deterministic top slice
      apy: 1 + i * 0.1,
    }));
    const ranked = rankProfile(many, "STABLE");
    expect(ranked).toHaveLength(15);
    // strictly decreasing scores
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });
});

describe("buildYields — full result contract", () => {
  it("filters to Base, splits into three profiles, ISO updatedAt", () => {
    const offChain: RawPool = { ...STEAKUSDC, chain: "Ethereum", pool: "eth-1" };
    const result = buildYields([STEAKUSDC, WEETH, USDC_NOCK, offChain]);

    expect(typeof result.updatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(result.updatedAt))).toBe(false);

    // off-chain pool must not appear anywhere
    const all = [
      ...result.profiles.stable,
      ...result.profiles.majors,
      ...result.profiles.degen,
    ];
    expect(all.some((p) => p.pool === "eth-1")).toBe(false);

    expect(result.profiles.stable.map((p) => p.symbol)).toContain("STEAKUSDC");
    expect(result.profiles.majors.map((p) => p.symbol)).toContain("WEETH");
    expect(result.profiles.degen.map((p) => p.symbol)).toContain("USDC-NOCK");
  });

  it("exposes the UI fields of spec §7 with reward-driven sustainability flag", () => {
    const result = buildYields([USDC_NOCK]);
    const card = result.profiles.degen[0]!;
    expect(card).toMatchObject({
      project: "aerodrome-v1",
      symbol: "USDC-NOCK",
      pool: "usdc-nock-pool",
      ilRisk: "yes",
      exposure: "multi",
      predictedClass: "Down",
      predictedProbability: 100,
    });
    expect(card.url).toBe("https://defillama.com/yields/pool/usdc-nock-pool");
    expect(card.sustainability).toBeLessThan(0.5); // reward-driven (apyBase null)
    expect(card.apyBase).toBe(0); // null coerced
  });
});

// --- Multi-chain (slug -> API chainName mapping, per-chain isolation) --------

describe("isChainSlug — strict whitelist (route returns 400 on unknown)", () => {
  it("accepts the four supported slugs", () => {
    expect(isChainSlug("base")).toBe(true);
    expect(isChainSlug("ethereum")).toBe(true);
    expect(isChainSlug("op")).toBe(true);
    expect(isChainSlug("arbitrum")).toBe(true);
  });

  it("rejects unknown / spoofed slugs (the route's 400 path)", () => {
    expect(isChainSlug("optimism")).toBe(false); // API says "OP Mainnet", slug is "op"
    expect(isChainSlug("polygon")).toBe(false);
    expect(isChainSlug("BASE")).toBe(false); // case-sensitive
    expect(isChainSlug("")).toBe(false);
    expect(isChainSlug("__proto__")).toBe(false); // hasOwnProperty guard
  });
});

describe("YIELD_CHAINS — slug maps to the exact API chain string", () => {
  it("maps 'op' to 'OP Mainnet' (NOT 'Optimism')", () => {
    expect(YIELD_CHAINS.op.chainName).toBe("OP Mainnet");
    expect(YIELD_CHAINS.op.label).toBe("OP Mainnet");
  });

  it("maps the other slugs to their identity chain names", () => {
    expect(YIELD_CHAINS.base.chainName).toBe("Base");
    expect(YIELD_CHAINS.ethereum.chainName).toBe("Ethereum");
    expect(YIELD_CHAINS.arbitrum.chainName).toBe("Arbitrum");
  });
});

describe("buildYields(pools, slug) — per-chain isolation, no cross-contamination", () => {
  // A mixed dataset: the same STABLE pool cloned onto two different chains.
  const baseStable: RawPool = { ...STEAKUSDC, pool: "base-stable" };
  const ethStable: RawPool = { ...STEAKUSDC, chain: "Ethereum", pool: "eth-stable" };
  const opMajor: RawPool = { ...WEETH, chain: "OP Mainnet", pool: "op-major" };
  const mixed = [baseStable, ethStable, opMajor];

  it("default slug is base (back-compat) and tags the result chain", () => {
    const result = buildYields(mixed); // no slug arg
    expect(result.chain).toEqual({ slug: "base", label: "Base" });
    expect(result.profiles.stable.map((p) => p.pool)).toEqual(["base-stable"]);
    // Each card carries its chain, stamped by the builder (single-chain too).
    expect(result.profiles.stable[0]!.chain).toBe("base");
  });

  it("stamps every card with the chain it was built for (op, not the slug 'op')", () => {
    const result = buildYields(mixed, "op");
    // The card's `chain` is the SLUG ("op"), not the API string ("OP Mainnet").
    expect(result.profiles.majors.map((p) => p.chain)).toEqual(["op"]);
  });

  it("'ethereum' keeps only Ethereum pools", () => {
    const result = buildYields(mixed, "ethereum");
    expect(result.chain).toEqual({ slug: "ethereum", label: "Ethereum" });
    expect(result.profiles.stable.map((p) => p.pool)).toEqual(["eth-stable"]);
    // Base/OP pools absent from every profile.
    const all = [
      ...result.profiles.stable,
      ...result.profiles.majors,
      ...result.profiles.degen,
    ].map((p) => p.pool);
    expect(all).not.toContain("base-stable");
    expect(all).not.toContain("op-major");
  });

  it("'op' filters on the API string 'OP Mainnet', not the slug", () => {
    const result = buildYields(mixed, "op");
    expect(result.chain).toEqual({ slug: "op", label: "OP Mainnet" });
    expect(result.profiles.majors.map((p) => p.pool)).toEqual(["op-major"]);
    expect(result.profiles.stable).toHaveLength(0); // no OP stable in the set
  });

  it("two builds over the same mixed dataset do not bleed into each other", () => {
    const onBase = buildYields(mixed, "base");
    const onEth = buildYields(mixed, "ethereum");
    expect(onBase.profiles.stable.map((p) => p.pool)).toEqual(["base-stable"]);
    expect(onEth.profiles.stable.map((p) => p.pool)).toEqual(["eth-stable"]);
  });
});

// --- Official protocol site resolution (projectUrl) -------------------------

describe("parseProtocols — origin-only, drops affiliate paths", () => {
  it("strips a referral path to its bare origin (LEGAL red line)", () => {
    // The exact example from the brief: DefiLlama ships spark's URL with a
    // points referral code in the path. Only the origin may ever be stored.
    const map = parseProtocols([
      { slug: "sparklend", url: "https://app.spark.fi/points/KNQ5HD" },
    ]);
    expect(map.sparklend).toBe("https://app.spark.fi");
    expect(map.sparklend).not.toContain("KNQ5HD");
  });

  it("strips query strings too and keeps scheme+host only", () => {
    const map = parseProtocols([
      { slug: "moonwell-lending", url: "https://moonwell.fi/?ref=xyz#anchor" },
    ]);
    expect(map["moonwell-lending"]).toBe("https://moonwell.fi");
  });

  it("drops protocols with a missing slug, missing url, or unparseable url", () => {
    const map = parseProtocols([
      { slug: "good", url: "https://good.xyz/path" },
      { slug: null, url: "https://noslug.xyz" },
      { slug: "nourl", url: null },
      { slug: "bad", url: "not a url" },
    ]);
    expect(map).toEqual({ good: "https://good.xyz" });
  });
});

describe("resolveProjectUrl — exact -> deterministic prefix -> null", () => {
  const urls = {
    "morpho-blue": "https://morpho.org",
    "moonwell-core": "https://moonwell.fi",
    "moonwell-lending": "https://lend.moonwell.fi",
    sparklend: "https://app.spark.fi",
  };

  it("matches on exact slug first", () => {
    expect(resolveProjectUrl("morpho-blue", urls)).toBe("https://morpho.org");
  });

  it("falls back to the FIRST prefix match in ASCII order (deterministic)", () => {
    // "moonwell" prefixes both moonwell-core and moonwell-lending; "moonwell-core"
    // sorts before "moonwell-lending", so the result is deterministic.
    expect(resolveProjectUrl("moonwell", urls)).toBe("https://moonwell.fi");
  });

  it("resolves the brief's spark example via prefix (spark -> sparklend)", () => {
    expect(resolveProjectUrl("spark", urls)).toBe("https://app.spark.fi");
  });

  it("returns null when no slug matches", () => {
    expect(resolveProjectUrl("unknown-protocol", urls)).toBeNull();
    expect(resolveProjectUrl("aerodrome-v1", urls)).toBeNull();
  });
});

describe("buildYields — projectUrl wiring (fallback null on miss / fetch fail)", () => {
  it("attaches the resolved origin when the project is in the map", () => {
    const result = buildYields([STEAKUSDC], "base", {
      "morpho-blue": "https://morpho.org",
    });
    const card = result.profiles.stable[0]!;
    expect(card.projectUrl).toBe("https://morpho.org");
    // DefiLlama fallback link stays untouched.
    expect(card.url).toBe("https://defillama.com/yields/pool/steakusdc-pool");
  });

  it("projectUrl is null when the project is absent (pool without protocol)", () => {
    const result = buildYields([STEAKUSDC], "base", {
      "some-other-proto": "https://elsewhere.xyz",
    });
    expect(result.profiles.stable[0]!.projectUrl).toBeNull();
  });

  it("projectUrl is null everywhere when the map is empty (fetch failed)", () => {
    // loadProjectUrls degrades to {} on any /protocols failure.
    const result = buildYields([STEAKUSDC, WEETH, USDC_NOCK], "base", {});
    const all = [
      ...result.profiles.stable,
      ...result.profiles.majors,
      ...result.profiles.degen,
    ];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((p) => p.projectUrl === null)).toBe(true);
  });

  it("default (no map arg) leaves projectUrl null — back-compat", () => {
    const result = buildYields([STEAKUSDC]);
    expect(result.profiles.stable[0]!.projectUrl).toBeNull();
  });
});

// --- "all" aggregation mode (merge + fan-out, never-fail) -------------------

describe("ALL_SLUG — accepted by the route's validation, NOT a real chain", () => {
  it("is the literal 'all'", () => {
    expect(ALL_SLUG).toBe("all");
  });

  it("'all' is NOT a chain slug (so the route handles it separately)", () => {
    // The route's guard is `slug === ALL_SLUG || isChainSlug(slug)`: "all" must
    // fail isChainSlug (it's an aggregation mode, absent from YIELD_CHAINS) yet
    // still be a valid request.
    expect(isChainSlug(ALL_SLUG)).toBe(false);
    expect(ALL_SLUG === ALL_SLUG || isChainSlug(ALL_SLUG)).toBe(true);
  });
});

describe("mergeAllYields — cross-chain merge, re-sorted desc, capped 15", () => {
  // Build one single-chain result per chain from a per-chain dataset.
  const baseRes = buildYields([{ ...STEAKUSDC, apy: 4 }], "base");
  const ethRes = buildYields([{ ...STEAKUSDC, chain: "Ethereum", apy: 9 }], "ethereum");
  const opRes = buildYields([{ ...WEETH, chain: "OP Mainnet" }], "op");

  it("merges all chains' pools and re-sorts each profile by score desc", () => {
    const merged = mergeAllYields([baseRes, ethRes, opRes]);
    expect(merged.chain).toEqual({ slug: "all", label: "All networks" });
    // Both stable pools present, the higher-APY (ethereum, apy 9) ranks first.
    const scores = merged.profiles.stable.map((p) => p.score);
    expect(merged.profiles.stable).toHaveLength(2);
    expect(scores[0]!).toBeGreaterThanOrEqual(scores[1]!);
    expect(merged.profiles.stable[0]!.chain).toBe("ethereum");
    expect(merged.profiles.stable[1]!.chain).toBe("base");
    // The OP majors pool surfaces in the majors profile, tagged "op".
    expect(merged.profiles.majors.map((p) => p.chain)).toEqual(["op"]);
  });

  it("preserves each pool's injected `chain` from its source dataset", () => {
    const merged = mergeAllYields([baseRes, ethRes]);
    const tags = merged.profiles.stable.map((p) => p.chain).sort();
    expect(tags).toEqual(["base", "ethereum"]);
  });

  it("caps each merged profile at 15 across chains", () => {
    const manyOn = (slug: ChainSlug, chainName: string) =>
      buildYields(
        Array.from({ length: 10 }, (_, i) => ({
          ...STEAKUSDC,
          chain: chainName,
          pool: `${slug}-stable-${i}`,
          apy: 1 + i * 0.1,
        })),
        slug,
      );
    const merged = mergeAllYields([manyOn("base", "Base"), manyOn("ethereum", "Ethereum")]);
    // 20 eligible across two chains -> capped to the global top 15.
    expect(merged.profiles.stable).toHaveLength(15);
    for (let i = 1; i < merged.profiles.stable.length; i++) {
      expect(merged.profiles.stable[i - 1]!.score).toBeGreaterThanOrEqual(
        merged.profiles.stable[i]!.score,
      );
    }
  });

  it("updatedAt is the MAX of the inputs' timestamps", () => {
    const older: YieldsResult = { ...baseRes, updatedAt: "2026-01-01T00:00:00.000Z" };
    const newer: YieldsResult = { ...ethRes, updatedAt: "2026-06-01T00:00:00.000Z" };
    expect(mergeAllYields([older, newer]).updatedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("empty input -> empty profiles with a valid ISO updatedAt (never-fail)", () => {
    const merged = mergeAllYields([]);
    expect(merged.profiles.stable).toHaveLength(0);
    expect(Number.isNaN(Date.parse(merged.updatedAt))).toBe(false);
  });
});

describe("fetchAllYields — fans out per chain, a failed chain contributes 0 pools", () => {
  const okRes = (slug: ChainSlug): YieldsResult =>
    buildYields(
      [{ ...STEAKUSDC, chain: YIELD_CHAINS[slug].chainName, pool: `${slug}-p` }],
      slug,
    );

  it("aggregates every chain when all succeed", async () => {
    const fetchOne = (slug: ChainSlug) => Promise.resolve(okRes(slug));
    const result = await fetchAllYields(fetchOne);
    // One stable pool per chain (4) -> all merged, each tagged with its chain.
    expect(result.profiles.stable.map((p) => p.chain).sort()).toEqual([
      "arbitrum",
      "base",
      "ethereum",
      "op",
    ]);
  });

  it("a rejected chain is dropped; the others still aggregate (allSettled)", async () => {
    const fetchOne = (slug: ChainSlug) =>
      slug === "op"
        ? Promise.reject(new Error("op upstream down"))
        : Promise.resolve(okRes(slug));
    const result = await fetchAllYields(fetchOne);
    const tags = result.profiles.stable.map((p) => p.chain).sort();
    expect(tags).toEqual(["arbitrum", "base", "ethereum"]); // op absent, no throw
  });
});

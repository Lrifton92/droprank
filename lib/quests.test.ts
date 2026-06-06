import { describe, it, expect } from "vitest";
import { computeQuests, QUESTS, QUESTS_MAX_POINTS } from "./quests";
import {
  AERODROME_ROUTER,
  UNISWAP_UNIVERSAL_ROUTER_V2,
  MOONWELL_COMPTROLLER,
  AAVE_V3_POOL,
  BASENAMES_EA_CONTROLLER,
  L2_STANDARD_BRIDGE,
  USDC_NATIVE,
  MORPHO_BLUE,
  COMPOUND_V3_USDC,
  PENDLE_ROUTER_V4,
  AVANTIS_TRADING,
  EXTRA_FINANCE_LENDING_POOL,
  PANCAKESWAP_SMART_ROUTER,
  SEAPORT_1_6,
  TALENT_PASSPORT_REGISTRY,
  SOCKET_GATEWAY,
  UNISWAP_UNIVERSAL_ROUTER_V3,
  UNISWAP_SWAP_ROUTER_02,
  MOONWELL_MCBETH,
  MOONWELL_MDAI,
  MOONWELL_MEURC,
  AAVE_V3_WETH_GATEWAY,
  COMPOUND_V3_WETH,
  COMPOUND_V3_AERO,
  COMPOUND_V3_USDBC,
  PANCAKESWAP_V3_SWAP_ROUTER,
  EXTRA_FINANCE_POSITION_MANAGER,
} from "./contracts-registry";
import type { Tx } from "./types";

const ADDR = "0xabc0000000000000000000000000000000000abc";
const DAY = 86400;

function tx(over: Partial<Tx>): Tx {
  return {
    hash: "0x" + Math.random().toString(16).slice(2),
    from: ADDR,
    to: "0x2222222222222222222222222222222222222222",
    value: "0",
    timestamp: 1_700_000_000,
    ...over,
  };
}

describe("quests registry", () => {
  it("has 19 quests (11 v1 + 7 v2 + Talent Builder Score; Zora removed)", () => {
    expect(QUESTS.length).toBe(19);
  });

  it("keeps the original v1 quest ids intact (minus Zora)", () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    for (const id of [
      "swap-aerodrome",
      "swap-uniswap",
      "lend-moonwell",
      "supply-aave",
      "mint-nft",
      "basename",
      "smart-wallet",
      "bridge-canonical",
      "deploy-contract",
      "active-30-days",
      "hold-usdc",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(ids.has("mint-zora")).toBe(false);
  });

  it("offers MORE than QUESTS_MAX_POINTS of paths (radar is a menu, earned is clamped)", () => {
    // Model B: total quest points exceed the 20-pt cap on purpose, so there are
    // multiple routes to max out the criterion. The cap is enforced at earn time.
    const sum = QUESTS.reduce((s, q) => s + q.points, 0);
    expect(sum).toBeGreaterThan(QUESTS_MAX_POINTS);
    expect(QUESTS_MAX_POINTS).toBe(20);
  });

  it("every quest has strictly positive points", () => {
    expect(QUESTS.every((q) => q.points > 0)).toBe(true);
  });

  it("quest ids are unique", () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
  });
});

describe("computeQuests", () => {
  it("returns 0 earned and all undone for an empty wallet", () => {
    const r = computeQuests([], ADDR);
    expect(r.earned).toBe(0);
    expect(r.quests.every((q) => !q.done)).toBe(true);
    expect(r.total).toBe(20);
  });

  it("detects an Aerodrome swap", () => {
    const r = computeQuests([tx({ to: AERODROME_ROUTER })], ADDR);
    expect(r.quests.find((q) => q.id === "swap-aerodrome")!.done).toBe(true);
  });

  it("detects a Uniswap swap (case-insensitive on `to`)", () => {
    const r = computeQuests(
      [tx({ to: UNISWAP_UNIVERSAL_ROUTER_V2.toUpperCase() })],
      ADDR,
    );
    expect(r.quests.find((q) => q.id === "swap-uniswap")!.done).toBe(true);
  });

  it("detects Moonwell, Aave, Basename, bridge, USDC", () => {
    const txs = [
      tx({ to: MOONWELL_COMPTROLLER }),
      tx({ to: AAVE_V3_POOL }),
      tx({ to: BASENAMES_EA_CONTROLLER }),
      tx({ to: L2_STANDARD_BRIDGE }),
      tx({ to: USDC_NATIVE }),
    ];
    const r = computeQuests(txs, ADDR);
    const done = (id: string) => r.quests.find((q) => q.id === id)!.done;
    expect(done("lend-moonwell")).toBe(true);
    expect(done("supply-aave")).toBe(true);
    expect(done("basename")).toBe(true);
    expect(done("bridge-canonical")).toBe(true);
    expect(done("hold-usdc")).toBe(true);
  });

  it("detects a generic NFT mint via mint method to a contract", () => {
    const r = computeQuests(
      [tx({ to: "0xdead000000000000000000000000000000000001", method: "mint", toIsContract: true })],
      ADDR,
    );
    expect(r.quests.find((q) => q.id === "mint-nft")!.done).toBe(true);
  });

  it("detects a contract deployment (to == null)", () => {
    const r = computeQuests(
      [tx({ to: null, createsContract: true })],
      ADDR,
    );
    expect(r.quests.find((q) => q.id === "deploy-contract")!.done).toBe(true);
  });

  it("detects a smart-wallet user (from is a contract address)", () => {
    // When the EOA-checked address is itself a smart wallet, txs originate from it.
    const r = computeQuests([tx({})], ADDR, { isSmartWallet: true });
    expect(r.quests.find((q) => q.id === "smart-wallet")!.done).toBe(true);
  });

  it("detects 30 distinct active days", () => {
    const now = 1_700_000_000;
    const txs = Array.from({ length: 30 }, (_, i) =>
      tx({ timestamp: now + i * DAY }),
    );
    const r = computeQuests(txs, ADDR);
    expect(r.quests.find((q) => q.id === "active-30-days")!.done).toBe(true);
    // 29 days should NOT complete it.
    const r2 = computeQuests(txs.slice(0, 29), ADDR);
    expect(r2.quests.find((q) => q.id === "active-30-days")!.done).toBe(false);
  });

  it("earned equals the sum of completed quest points (below the cap)", () => {
    const txs = [tx({ to: AERODROME_ROUTER }), tx({ to: AAVE_V3_POOL })];
    const r = computeQuests(txs, ADDR);
    const expected = r.quests
      .filter((q) => q.done)
      .reduce((s, q) => s + q.points, 0);
    expect(r.earned).toBe(expected);
  });

  it("detects the v2 protocol quests via tx.to", () => {
    const txs = [
      tx({ to: MORPHO_BLUE }),
      tx({ to: COMPOUND_V3_USDC }),
      tx({ to: PENDLE_ROUTER_V4 }),
      tx({ to: AVANTIS_TRADING }),
      tx({ to: EXTRA_FINANCE_LENDING_POOL }),
      tx({ to: PANCAKESWAP_SMART_ROUTER }),
      tx({ to: SEAPORT_1_6 }),
    ];
    const r = computeQuests(txs, ADDR);
    const done = (id: string) => r.quests.find((q) => q.id === id)!.done;
    expect(done("lend-morpho")).toBe(true);
    expect(done("lend-compound")).toBe(true);
    expect(done("yield-pendle")).toBe(true);
    expect(done("perps-avantis")).toBe(true);
    expect(done("leverage-extra")).toBe(true);
    expect(done("swap-pancakeswap")).toBe(true);
    expect(done("trade-opensea")).toBe(true);
  });

  it("detects a Talent Builder Score (PassportRegistry interaction)", () => {
    const r = computeQuests([tx({ to: TALENT_PASSPORT_REGISTRY })], ADDR);
    expect(r.quests.find((q) => q.id === "talent-builder-score")!.done).toBe(true);
  });

  describe("FIX B — extended contract registry (new verified addresses)", () => {
    const done = (r: ReturnType<typeof computeQuests>, id: string) =>
      r.quests.find((q) => q.id === id)!.done;

    it("detects a Uniswap swap via the V3 UniversalRouter and SwapRouter02", () => {
      expect(done(computeQuests([tx({ to: UNISWAP_UNIVERSAL_ROUTER_V3 })], ADDR), "swap-uniswap")).toBe(true);
      expect(done(computeQuests([tx({ to: UNISWAP_SWAP_ROUTER_02 })], ADDR), "swap-uniswap")).toBe(true);
    });

    it("detects Moonwell lend via mcbETH / mDAI / mEURC mTokens", () => {
      for (const mtoken of [MOONWELL_MCBETH, MOONWELL_MDAI, MOONWELL_MEURC]) {
        expect(done(computeQuests([tx({ to: mtoken })], ADDR), "lend-moonwell")).toBe(true);
      }
    });

    it("detects an Aave native-ETH supply via the WrappedTokenGateway", () => {
      expect(done(computeQuests([tx({ to: AAVE_V3_WETH_GATEWAY })], ADDR), "supply-aave")).toBe(true);
    });

    it("detects Compound supply on the WETH / AERO / USDbC markets", () => {
      for (const comet of [COMPOUND_V3_WETH, COMPOUND_V3_AERO, COMPOUND_V3_USDBC]) {
        expect(done(computeQuests([tx({ to: comet })], ADDR), "lend-compound")).toBe(true);
      }
    });

    it("detects a PancakeSwap swap via the V3 SwapRouter", () => {
      expect(done(computeQuests([tx({ to: PANCAKESWAP_V3_SWAP_ROUTER })], ADDR), "swap-pancakeswap")).toBe(true);
    });

    it("detects Extra Finance via the VeloPositionManager", () => {
      expect(done(computeQuests([tx({ to: EXTRA_FINANCE_POSITION_MANAGER })], ADDR), "leverage-extra")).toBe(true);
    });
  });

  describe("FIX A — outgoing internal txs count for protocol quests (smart wallets)", () => {
    const done = (r: ReturnType<typeof computeQuests>, id: string) =>
      r.quests.find((q) => q.id === id)!.done;

    it("counts an Aerodrome swap dispatched as an outgoing internal call", () => {
      // Smart wallet: no normal tx to Aerodrome, but the swap is an internal call out.
      const r = computeQuests([tx({ to: "0x9999999999999999999999999999999999999999" })], ADDR, {
        internalOutTo: [AERODROME_ROUTER],
      });
      expect(done(r, "swap-aerodrome")).toBe(true);
    });

    it("counts a Uniswap (Set) interaction via an outgoing internal call", () => {
      const r = computeQuests([tx({})], ADDR, { internalOutTo: [UNISWAP_UNIVERSAL_ROUTER_V3] });
      expect(done(r, "swap-uniswap")).toBe(true);
    });

    it("does not validate when the internal call targets an unrelated contract", () => {
      const r = computeQuests([tx({})], ADDR, {
        internalOutTo: ["0x1111111111111111111111111111111111111111"],
      });
      expect(done(r, "swap-aerodrome")).toBe(false);
      expect(done(r, "swap-uniswap")).toBe(false);
    });
  });

  describe("FIX D — token-transfer pass (mint-nft, hold-usdc)", () => {
    const done = (r: ReturnType<typeof computeQuests>, id: string) =>
      r.quests.find((q) => q.id === id)!.done;

    it("detects mint-nft from an ERC-721/1155 transfer-from-0x0 (no mint method)", () => {
      // A pure NFT mint shows no decoded "mint" method on the normal tx list.
      const r = computeQuests([tx({ method: "0xabcdef12", toIsContract: true })], ADDR, {
        mintedNft: true,
      });
      expect(done(r, "mint-nft")).toBe(true);
    });

    it("still detects mint-nft via the legacy method heuristic (non-regression)", () => {
      const r = computeQuests(
        [tx({ to: "0xdead000000000000000000000000000000000001", method: "mint", toIsContract: true })],
        ADDR,
      );
      expect(done(r, "mint-nft")).toBe(true);
    });

    it("detects hold-usdc from a passive inbound USDC receipt (ctx.receivedUsdc)", () => {
      const r = computeQuests([tx({})], ADDR, { receivedUsdc: true });
      expect(done(r, "hold-usdc")).toBe(true);
    });

    it("does not flag mint/usdc without the token signals or a direct tx", () => {
      const r = computeQuests([tx({})], ADDR);
      expect(done(r, "mint-nft")).toBe(false);
      expect(done(r, "hold-usdc")).toBe(false);
    });
  });

  describe("FIX F — Talent Builder Score (off-chain signal)", () => {
    const done = (r: ReturnType<typeof computeQuests>, id: string) =>
      r.quests.find((q) => q.id === id)!.done;

    it("validates on a real off-chain Builder Score (ctx.talentBuilderScore > 0)", () => {
      const r = computeQuests([tx({})], ADDR, { talentBuilderScore: 42 });
      expect(done(r, "talent-builder-score")).toBe(true);
    });

    it("does not validate on a zero Builder Score with no onchain interaction", () => {
      const r = computeQuests([tx({})], ADDR, { talentBuilderScore: 0 });
      expect(done(r, "talent-builder-score")).toBe(false);
    });

    it("still validates on the onchain signal when no score is supplied (fallback)", () => {
      const r = computeQuests([tx({ to: TALENT_PASSPORT_REGISTRY })], ADDR);
      expect(done(r, "talent-builder-score")).toBe(true);
    });
  });

  describe("bridge-canonical (third-party bridges + inbound fills)", () => {
    const bridgeDone = (r: ReturnType<typeof computeQuests>) =>
      r.quests.find((q) => q.id === "bridge-canonical")!.done;

    it("validates on an inbound internal fill (ctx.inboundBridge) with no normal bridge tx", () => {
      // Across fill onto Base: from = SpokePool, value > 0, internal tx only.
      const r = computeQuests([tx({})], ADDR, { inboundBridge: true });
      expect(bridgeDone(r)).toBe(true);
    });

    it("validates on a normal tx to a third-party bridge (Socket gateway)", () => {
      const r = computeQuests([tx({ to: SOCKET_GATEWAY })], ADDR);
      expect(bridgeDone(r)).toBe(true);
    });

    it("still validates on a normal tx to the canonical L2 bridge (non-regression)", () => {
      const r = computeQuests([tx({ to: L2_STANDARD_BRIDGE })], ADDR);
      expect(bridgeDone(r)).toBe(true);
    });

    it("does not validate with no bridge interaction at all", () => {
      const r = computeQuests([tx({ to: AERODROME_ROUTER })], ADDR);
      expect(bridgeDone(r)).toBe(false);
    });
  });

  it("clamps earned at total when more than 20 pts of quests are completed", () => {
    // Complete every quest: raw sum exceeds 20, but earned is capped at total.
    const txs: Tx[] = [
      tx({ to: AERODROME_ROUTER }),
      tx({ to: UNISWAP_UNIVERSAL_ROUTER_V2 }),
      tx({ to: MOONWELL_COMPTROLLER }),
      tx({ to: AAVE_V3_POOL }),
      tx({ to: "0xdead000000000000000000000000000000000001", method: "mint", toIsContract: true }),
      tx({ to: BASENAMES_EA_CONTROLLER }),
      tx({ to: L2_STANDARD_BRIDGE }),
      tx({ to: null, createsContract: true }),
      tx({ to: USDC_NATIVE }),
      tx({ to: MORPHO_BLUE }),
      tx({ to: COMPOUND_V3_USDC }),
      tx({ to: PENDLE_ROUTER_V4 }),
      tx({ to: AVANTIS_TRADING }),
      tx({ to: EXTRA_FINANCE_LENDING_POOL }),
      tx({ to: PANCAKESWAP_SMART_ROUTER }),
      tx({ to: SEAPORT_1_6 }),
      ...Array.from({ length: 30 }, (_, i) =>
        tx({ timestamp: 1_700_000_000 + i * DAY }),
      ),
    ];
    const r = computeQuests(txs, ADDR, { isSmartWallet: true });
    const rawSum = r.quests
      .filter((q) => q.done)
      .reduce((s, q) => s + q.points, 0);
    expect(rawSum).toBeGreaterThan(QUESTS_MAX_POINTS);
    expect(r.earned).toBe(QUESTS_MAX_POINTS);
    expect(r.earned).toBeLessThanOrEqual(r.total);
  });

  it("derives distinct protocol categories from completed quests (v2)", () => {
    const r = computeQuests(
      [
        tx({ to: AERODROME_ROUTER }), // DEX
        tx({ to: PANCAKESWAP_SMART_ROUTER }), // DEX (same family)
        tx({ to: AAVE_V3_POOL }), // Lending
        tx({ to: SEAPORT_1_6 }), // NFT
        tx({ to: USDC_NATIVE }), // hold-usdc: no category
      ],
      ADDR,
    );
    const cats = new Set(r.categoriesTouched);
    expect(cats).toEqual(new Set(["DEX", "Lending", "NFT"]));
  });

  it("reports no categories for a wallet with no protocol quests", () => {
    const r = computeQuests([tx({ to: USDC_NATIVE })], ADDR);
    expect(r.categoriesTouched).toEqual([]);
  });

  it("every quest with a category maps to one of the 7 protocol families", () => {
    const FAMILIES = new Set([
      "DEX", "Lending", "Perps", "Identity", "Bridge", "NFT", "Social",
    ]);
    for (const q of QUESTS) {
      if (q.category) expect(FAMILIES.has(q.category)).toBe(true);
    }
  });
});

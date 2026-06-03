import { describe, it, expect } from "vitest";
import { computeQuests, QUESTS, QUESTS_MAX_POINTS } from "./quests";
import {
  AERODROME_ROUTER,
  UNISWAP_UNIVERSAL_ROUTER_V2,
  MOONWELL_COMPTROLLER,
  AAVE_V3_POOL,
  ZORA_1155_FACTORY,
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
  it("has 19 quests (12 v1 + 7 v2)", () => {
    expect(QUESTS.length).toBe(19);
  });

  it("keeps the 12 original v1 quest ids intact", () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    for (const id of [
      "swap-aerodrome",
      "swap-uniswap",
      "lend-moonwell",
      "supply-aave",
      "mint-nft",
      "mint-zora",
      "basename",
      "smart-wallet",
      "bridge-canonical",
      "deploy-contract",
      "active-30-days",
      "hold-usdc",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
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

  it("detects Moonwell, Aave, Zora, Basename, bridge, USDC", () => {
    const txs = [
      tx({ to: MOONWELL_COMPTROLLER }),
      tx({ to: AAVE_V3_POOL }),
      tx({ to: ZORA_1155_FACTORY }),
      tx({ to: BASENAMES_EA_CONTROLLER }),
      tx({ to: L2_STANDARD_BRIDGE }),
      tx({ to: USDC_NATIVE }),
    ];
    const r = computeQuests(txs, ADDR);
    const done = (id: string) => r.quests.find((q) => q.id === id)!.done;
    expect(done("lend-moonwell")).toBe(true);
    expect(done("supply-aave")).toBe(true);
    expect(done("mint-zora")).toBe(true);
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

  it("clamps earned at total when more than 20 pts of quests are completed", () => {
    // Complete every quest: raw sum exceeds 20, but earned is capped at total.
    const txs: Tx[] = [
      tx({ to: AERODROME_ROUTER }),
      tx({ to: UNISWAP_UNIVERSAL_ROUTER_V2 }),
      tx({ to: MOONWELL_COMPTROLLER }),
      tx({ to: AAVE_V3_POOL }),
      tx({ to: "0xdead000000000000000000000000000000000001", method: "mint", toIsContract: true }),
      tx({ to: ZORA_1155_FACTORY }),
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
});

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
  it("has exactly 12 quests", () => {
    expect(QUESTS.length).toBe(12);
  });

  it("quest points sum to QUESTS_MAX_POINTS (20)", () => {
    const sum = QUESTS.reduce((s, q) => s + q.points, 0);
    expect(sum).toBe(20);
    expect(QUESTS_MAX_POINTS).toBe(20);
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

  it("earned equals the sum of completed quest points", () => {
    const txs = [tx({ to: AERODROME_ROUTER }), tx({ to: AAVE_V3_POOL })];
    const r = computeQuests(txs, ADDR);
    const expected = r.quests
      .filter((q) => q.done)
      .reduce((s, q) => s + q.points, 0);
    expect(r.earned).toBe(expected);
  });
});

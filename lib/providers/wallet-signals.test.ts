import { describe, it, expect } from "vitest";
import {
  detectInboundBridge,
  collectInternalOutTo,
  detectReceivedUsdc,
  detectMintedNft,
  INTERNAL_OUT_CAP,
  type InternalRow,
  type TokenTransferRow,
} from "./wallet-signals";
import {
  ACROSS_SPOKE_POOL,
  L2_STANDARD_BRIDGE,
  USDC_NATIVE,
  AERODROME_ROUTER,
} from "../contracts-registry";

const ADDR = "0xabc0000000000000000000000000000000000abc";
const OTHER = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";

const internal = (over: Partial<InternalRow> = {}): InternalRow => ({
  from: OTHER,
  to: ADDR,
  value: "1000000000000000000",
  ...over,
});

const transfer = (over: Partial<TokenTransferRow> = {}): TokenTransferRow => ({
  from: OTHER,
  to: ADDR,
  token: USDC_NATIVE,
  type: "ERC-20",
  ...over,
});

describe("detectInboundBridge", () => {
  it("flags an Across fill (from = SpokePool, value > 0, to = wallet)", () => {
    expect(detectInboundBridge([internal({ from: ACROSS_SPOKE_POOL })], ADDR)).toBe(true);
  });
  it("ignores a zero-value bridge internal", () => {
    expect(detectInboundBridge([internal({ from: L2_STANDARD_BRIDGE, value: "0" })], ADDR)).toBe(false);
  });
  it("ignores internals from non-bridge contracts", () => {
    expect(detectInboundBridge([internal({ from: USDC_NATIVE })], ADDR)).toBe(false);
  });
});

describe("collectInternalOutTo", () => {
  it("collects distinct lowercased `to` of the wallet's outgoing internals", () => {
    const got = collectInternalOutTo(
      [
        internal({ from: ADDR, to: AERODROME_ROUTER.toUpperCase() }),
        internal({ from: ADDR, to: AERODROME_ROUTER }), // dup
        internal({ from: ADDR, to: OTHER }),
      ],
      ADDR,
    );
    expect(new Set(got)).toEqual(new Set([AERODROME_ROUTER, OTHER]));
  });
  it("ignores inbound internals (from != wallet), self-targets and null to", () => {
    const got = collectInternalOutTo(
      [
        internal({ from: OTHER, to: AERODROME_ROUTER }), // inbound: skip
        internal({ from: ADDR, to: ADDR }), // self: skip
        internal({ from: ADDR, to: null }), // null: skip
      ],
      ADDR,
    );
    expect(got).toEqual([]);
  });
  it("caps the collected set", () => {
    const items = Array.from({ length: INTERNAL_OUT_CAP + 50 }, (_, i) =>
      internal({ from: ADDR, to: "0x" + i.toString(16).padStart(40, "0") }),
    );
    expect(collectInternalOutTo(items, ADDR).length).toBe(INTERNAL_OUT_CAP);
  });
});

describe("detectReceivedUsdc", () => {
  it("flags an inbound native-USDC ERC-20 transfer", () => {
    expect(detectReceivedUsdc([transfer({ token: USDC_NATIVE.toUpperCase() })], ADDR)).toBe(true);
  });
  it("ignores a USDC transfer OUT of the wallet", () => {
    expect(detectReceivedUsdc([transfer({ from: ADDR, to: OTHER })], ADDR)).toBe(false);
  });
  it("ignores a non-USDC token received", () => {
    expect(detectReceivedUsdc([transfer({ token: OTHER })], ADDR)).toBe(false);
  });
});

describe("detectMintedNft", () => {
  it("flags an ERC-721 transfer FROM 0x0 to the wallet (a mint)", () => {
    expect(detectMintedNft([transfer({ type: "ERC-721", from: ZERO, token: OTHER })], ADDR)).toBe(true);
  });
  it("flags an ERC-1155 mint from 0x0", () => {
    expect(detectMintedNft([transfer({ type: "ERC-1155", from: ZERO, token: OTHER })], ADDR)).toBe(true);
  });
  it("does NOT count an ERC-20 transfer from 0x0 (token issuance, not an NFT mint)", () => {
    expect(detectMintedNft([transfer({ type: "ERC-20", from: ZERO })], ADDR)).toBe(false);
  });
  it("ignores an NFT transfer from a non-zero address (secondary transfer)", () => {
    expect(detectMintedNft([transfer({ type: "ERC-721", from: OTHER, token: OTHER })], ADDR)).toBe(false);
  });
});

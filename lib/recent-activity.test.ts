import { describe, it, expect } from "vitest";
import { formatRecentTx, type RawTx } from "./recent-activity";
import { AERODROME_UNIVERSAL_ROUTER } from "./contracts-registry";

const WALLET = "0x1111111111111111111111111111111111111111";

function raw(over: Partial<RawTx>): RawTx {
  return {
    hash: "0xhash",
    from: WALLET,
    to: "0x2222222222222222222222222222222222222222",
    value: "0",
    timeStamp: "1700000000",
    ...over,
  };
}

describe("formatRecentTx", () => {
  it("labels a known Aerodrome router swap with the protocol + swap action", () => {
    const r = formatRecentTx(
      raw({
        to: AERODROME_UNIVERSAL_ROUTER.toUpperCase(), // case-insensitive match
        functionName: "execute(bytes,bytes[],uint256)",
      }),
      WALLET,
    );
    // functionName -> leading verb "execute"; label resolves to the protocol.
    expect(r.label).toBe("Aerodrome");
    expect(r.action).toBe("execute");
    expect(r.incoming).toBe(false);
  });

  it("derives a swap verb from swapExactTokens functionName", () => {
    const r = formatRecentTx(
      raw({ to: AERODROME_UNIVERSAL_ROUTER, functionName: "swapExactTokensForTokens(uint256,uint256,address[])" }),
      WALLET,
    );
    expect(r.action).toBe("swapExactTokensForTokens");
    expect(r.label).toBe("Aerodrome");
  });

  it("marks an incoming tx (wallet is the recipient) with the received sentinel", () => {
    const r = formatRecentTx(
      raw({ from: "0x9999999999999999999999999999999999999999", to: WALLET, value: "0" }),
      WALLET,
    );
    expect(r.incoming).toBe(true);
    expect(r.label).toBe("__received__");
  });

  it("formats an outgoing ETH transfer value and tags it as a transfer", () => {
    const r = formatRecentTx(
      raw({ value: "1200000000000000" }), // 0.0012 ETH, no method
      WALLET,
    );
    expect(r.valueEth).toBe("0.0012");
    expect(r.action).toBe("__transfer__");
    expect(r.incoming).toBe(false);
    // unknown counterparty -> short address
    expect(r.label).toBe("0x2222…2222");
  });

  it("tags a contract deployment (to empty) with the deploy sentinel", () => {
    const r = formatRecentTx(raw({ to: "", value: "0" }), WALLET);
    expect(r.label).toBe("__deploy__");
    expect(r.incoming).toBe(false);
    expect(r.valueEth).toBe("");
  });

  it("returns empty valueEth for a zero-value call and the interaction sentinel", () => {
    const r = formatRecentTx(raw({ value: "0" }), WALLET);
    expect(r.valueEth).toBe("");
    expect(r.action).toBe("__interaction__");
  });

  it("carries hash and timestamp through unchanged", () => {
    const r = formatRecentTx(raw({ hash: "0xabc", timeStamp: "1699999999" }), WALLET);
    expect(r.hash).toBe("0xabc");
    expect(r.timestamp).toBe(1699999999);
  });

  it("decodes a known method selector to a verb when functionName is absent (Blockscout compat)", () => {
    // Blockscout etherscan-compat returns methodId but no functionName, so most
    // rows would read "interaction" without selector decoding.
    const swap = formatRecentTx(
      raw({ to: AERODROME_UNIVERSAL_ROUTER, functionName: "", methodId: "0x3593564c" }),
      WALLET,
    );
    expect(swap.action).toBe("swap"); // Universal Router execute
    expect(swap.label).toBe("Aerodrome");

    expect(formatRecentTx(raw({ functionName: "", methodId: "0x095ea7b3" }), WALLET).action).toBe("approve");
    expect(formatRecentTx(raw({ functionName: "", methodId: "0xa9059cbb" }), WALLET).action).toBe("transfer");
  });

  it("falls back to the interaction sentinel for an unknown selector", () => {
    const r = formatRecentTx(raw({ functionName: "", methodId: "0xdeadbeef", value: "0" }), WALLET);
    expect(r.action).toBe("__interaction__");
  });

  it("shows no value for dust/zero ETH (never a bare '0')", () => {
    expect(formatRecentTx(raw({ value: "0" }), WALLET).valueEth).toBe("");
    expect(formatRecentTx(raw({ value: "1000000" }), WALLET).valueEth).toBe(""); // 1e-12 ETH
    expect(formatRecentTx(raw({ value: "100000000000000" }), WALLET).valueEth).toBe("0.0001"); // 1e-4 shows
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// viem is mocked: fetchTalentBuilderScore reads the PassportBuilderScore contract
// via a public client's readContract, never over HTTP. Each test drives that one
// boundary. The spy is declared via vi.hoisted so it exists when the (hoisted)
// vi.mock factory runs.
const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }));
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract }),
    http: () => ({}),
  };
});

import { fetchTalentBuilderScore, __resetTalentCache } from "./talent";

const ADDR = "0xabc0000000000000000000000000000000000abc";

describe("fetchTalentBuilderScore (onchain, keyless)", () => {
  beforeEach(() => {
    readContract.mockReset();
    __resetTalentCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the last-update timestamp when the wallet has a Builder Score", async () => {
    // 0x1deeaEc4… on Base: getLastUpdateByAddress = 1764568729 (score created, now expired).
    readContract.mockResolvedValueOnce(BigInt(1764568729));
    const v = await fetchTalentBuilderScore(ADDR, undefined);
    expect(v).toBe(1764568729);
    // Reads getLastUpdateByAddress (never reverts) with the address as the arg.
    const args = readContract.mock.calls[0][0];
    expect(args.functionName).toBe("getLastUpdateByAddress");
    expect(args.args).toEqual([ADDR]);
  });

  it("returns 0 when the wallet never created a Builder Score (lastUpdate = 0)", async () => {
    // 0xb0e3675… on Base: getLastUpdateByAddress = 0.
    readContract.mockResolvedValueOnce(BigInt(0));
    expect(await fetchTalentBuilderScore(ADDR, undefined)).toBe(0);
  });

  it("returns 0 without throwing on an RPC failure", async () => {
    readContract.mockRejectedValueOnce(new Error("RPC down"));
    await expect(fetchTalentBuilderScore(ADDR, undefined)).resolves.toBe(0);
  });

  it("caches per address (a second call hits no RPC)", async () => {
    readContract.mockResolvedValueOnce(BigInt(1764568729));
    await fetchTalentBuilderScore(ADDR, undefined);
    await fetchTalentBuilderScore(ADDR, undefined);
    expect(readContract).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWalletData,
  BlockscoutError,
  __test,
} from "./blockscout";

const ADDR = "0xabc0000000000000000000000000000000000abc";

/** Build a Blockscout v2 tx item. */
function item(over: Record<string, unknown> = {}) {
  return {
    hash: "0x" + Math.random().toString(16).slice(2),
    from: { hash: ADDR, is_contract: false },
    to: { hash: "0x2222222222222222222222222222222222222222", is_contract: true },
    value: "0",
    timestamp: "2026-05-01T00:00:00.000000Z",
    method: null,
    created_contract: null,
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("normalizeTx", () => {
  it("maps a v2 item to our Tx shape, lowercasing addresses", () => {
    const t = __test.normalizeTx(
      item({
        from: { hash: ADDR.toUpperCase(), is_contract: false },
        to: { hash: "0xAB", is_contract: true },
        value: "1000",
        timestamp: "2026-05-01T00:00:00.000000Z",
        method: "Swap",
      }),
    );
    expect(t.from).toBe(ADDR);
    expect(t.to).toBe("0xab");
    expect(t.value).toBe("1000");
    expect(t.toIsContract).toBe(true);
    expect(t.method).toBe("swap");
    expect(typeof t.timestamp).toBe("number");
  });

  it("marks contract creation when created_contract is present and to is null", () => {
    const t = __test.normalizeTx(
      item({ to: null, created_contract: { hash: "0xdead" } }),
    );
    expect(t.to).toBeNull();
    expect(t.createsContract).toBe(true);
  });
});

describe("fetchWalletData", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an invalid address before any network call", async () => {
    await expect(fetchWalletData("not-an-address")).rejects.toBeInstanceOf(
      BlockscoutError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aggregates txs across pages up to the cap and reports isContract", async () => {
    // address info call -> is_contract false
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ is_contract: false, hash: ADDR }),
    );
    // page 1: 2 txs + next_page_params
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [item(), item()],
        next_page_params: { block_number: 1, index: 1 },
      }),
    );
    // page 2: 1 tx, no next page
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [item()], next_page_params: null }),
    );

    const data = await fetchWalletData(ADDR);
    expect(data.txs.length).toBe(3);
    expect(data.txCount).toBe(3);
    expect(data.isContract).toBe(false);
    expect(data.address).toBe(ADDR);
  });

  it("throws a typed BlockscoutError on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchWalletData(ADDR)).rejects.toBeInstanceOf(BlockscoutError);
  });

  it("treats a 404 address as an empty (unused) wallet, not an error", async () => {
    // address info 404 -> not a contract, no txs
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], next_page_params: null }),
    );
    const data = await fetchWalletData(ADDR);
    expect(data.txCount).toBe(0);
    expect(data.isContract).toBe(false);
  });
});

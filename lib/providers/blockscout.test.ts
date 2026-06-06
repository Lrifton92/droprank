import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWalletData,
  BlockscoutError,
  __test,
} from "./blockscout";
import { ACROSS_SPOKE_POOL } from "../contracts-registry";

const ADDR = "0xabc0000000000000000000000000000000000abc";

/** Build a Blockscout v2 internal-transaction item (subset we read). */
function internalItem(over: Record<string, unknown> = {}) {
  return {
    from: { hash: "0x2222222222222222222222222222222222222222" },
    to: { hash: ADDR },
    value: "1000000000000000000",
    ...over,
  };
}

/** Empty internal-transactions page (default for tests that don't assert bridge). */
function emptyInternal() {
  return jsonResponse({ items: [], next_page_params: null });
}

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
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/internal-transactions")) return Promise.resolve(emptyInternal());
      if (url.endsWith(`/addresses/${ADDR}`)) {
        return Promise.resolve(jsonResponse({ is_contract: false, hash: ADDR }));
      }
      // tx pages: first call returns a next page, second ends.
      return Promise.resolve(
        firstPageDone
          ? jsonResponse({ items: [item()], next_page_params: null })
          : ((firstPageDone = true),
            jsonResponse({
              items: [item(), item()],
              next_page_params: { block_number: 1, index: 1 },
            })),
      );
    });
    let firstPageDone = false;

    const data = await fetchWalletData(ADDR);
    expect(data.txs.length).toBe(3);
    expect(data.txCount).toBe(3);
    expect(data.isContract).toBe(false);
    expect(data.address).toBe(ADDR);
    expect(data.inboundBridge).toBe(false);
  });

  it("sets inboundBridge from a v2 internal Across fill (from = SpokePool, value > 0)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/internal-transactions")) {
        return Promise.resolve(
          jsonResponse({
            items: [internalItem({ from: { hash: ACROSS_SPOKE_POOL } })],
            next_page_params: null,
          }),
        );
      }
      if (url.endsWith(`/addresses/${ADDR}`)) {
        return Promise.resolve(jsonResponse({ is_contract: false, hash: ADDR }));
      }
      return Promise.resolve(jsonResponse({ items: [item()], next_page_params: null }));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.inboundBridge).toBe(true);
  });

  it("never fails the scan when the internal-tx call errors (inboundBridge falsy)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/internal-transactions")) return Promise.resolve(jsonResponse({}, 500));
      if (url.endsWith(`/addresses/${ADDR}`)) {
        return Promise.resolve(jsonResponse({ is_contract: false, hash: ADDR }));
      }
      return Promise.resolve(jsonResponse({ items: [item()], next_page_params: null }));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.txCount).toBe(1);
    expect(data.inboundBridge).toBe(false);
  });

  it("throws a typed BlockscoutError on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchWalletData(ADDR)).rejects.toBeInstanceOf(BlockscoutError);
  });

  it("treats a 404 address as an empty (unused) wallet, not an error", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/internal-transactions")) return Promise.resolve(emptyInternal());
      if (url.endsWith(`/addresses/${ADDR}`)) return Promise.resolve(jsonResponse({}, 404));
      return Promise.resolve(jsonResponse({ items: [], next_page_params: null }));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.txCount).toBe(0);
    expect(data.isContract).toBe(false);
  });
});

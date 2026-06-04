import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWalletData,
  EtherscanError,
  __test,
} from "./etherscan";

const ADDR = "0xabc0000000000000000000000000000000000abc";
const KEY = "TEST_KEY";

/** Build a raw Etherscan v2 txlist item. */
function esTx(over: Record<string, unknown> = {}) {
  return {
    hash: "0x" + Math.random().toString(16).slice(2),
    timeStamp: "1746057600", // 2025-05-01T00:00:00Z
    from: ADDR,
    to: "0x2222222222222222222222222222222222222222",
    value: "0",
    input: "0xa9059cbb0000",
    contractAddress: "",
    functionName: "transfer(address,uint256)",
    methodId: "0xa9059cbb",
    isError: "0",
    ...over,
  };
}

function envelope(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** txlist success envelope. */
function txlistOk(items: unknown[]) {
  return envelope({ status: "1", message: "OK", result: items });
}

/** eth_getCode envelope (proxy module returns bytecode directly). */
function getCode(code: string) {
  return envelope({ jsonrpc: "2.0", id: 1, result: code });
}

describe("deriveMethod", () => {
  it("strips the param list from functionName and lowercases", () => {
    expect(__test.deriveMethod(esTx({ functionName: "Swap(uint256,uint256)" }))).toBe(
      "swap",
    );
  });
  it("falls back to methodId when functionName is empty", () => {
    expect(
      __test.deriveMethod(esTx({ functionName: "", methodId: "0xABCDEF12" })),
    ).toBe("0xabcdef12");
  });
  it("returns null for a plain transfer (no data)", () => {
    expect(
      __test.deriveMethod(esTx({ functionName: "", methodId: "0x" })),
    ).toBeNull();
  });
});

describe("normalizeTx", () => {
  it("maps an Etherscan item to our Tx shape, lowercasing addresses", () => {
    const t = __test.normalizeTx(
      esTx({
        from: ADDR.toUpperCase(),
        to: "0xAB",
        value: "1000",
        timeStamp: "1746057600",
        functionName: "transfer(address,uint256)",
      }),
    );
    expect(t.from).toBe(ADDR);
    expect(t.to).toBe("0xab");
    expect(t.value).toBe("1000");
    expect(t.method).toBe("transfer");
    expect(t.timestamp).toBe(1746057600);
  });

  it("treats a tx with call data to an address as a contract interaction", () => {
    const t = __test.normalizeTx(esTx({ input: "0xa9059cbb", functionName: "" }));
    expect(t.toIsContract).toBe(true);
  });

  it("treats a plain ETH transfer (no data) as a non-contract target", () => {
    const t = __test.normalizeTx(
      esTx({ input: "0x", methodId: "0x", functionName: "", value: "1000" }),
    );
    expect(t.toIsContract).toBe(false);
    expect(t.method).toBeNull();
  });

  it("marks contract creation when `to` is empty and contractAddress is set", () => {
    const t = __test.normalizeTx(
      esTx({ to: "", contractAddress: "0xdeadbeef", input: "0x60806040" }),
    );
    expect(t.to).toBeNull();
    expect(t.createsContract).toBe(true);
  });
});

describe("fetchWalletData", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const prevKey = process.env.ETHERSCAN_API_KEY;

  beforeEach(() => {
    process.env.ETHERSCAN_API_KEY = KEY;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevKey === undefined) delete process.env.ETHERSCAN_API_KEY;
    else process.env.ETHERSCAN_API_KEY = prevKey;
  });

  it("rejects an invalid address before any network call", async () => {
    await expect(fetchWalletData("not-an-address")).rejects.toBeInstanceOf(
      EtherscanError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws no_api_key when the env var is missing (caller falls back)", async () => {
    delete process.env.ETHERSCAN_API_KEY;
    await expect(fetchWalletData(ADDR)).rejects.toMatchObject({
      kind: "no_api_key",
    });
  });

  it("aggregates txs in one call and reports isContract via eth_getCode", async () => {
    // Both calls fire in parallel via Promise.all; resolve by URL, not order.
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlist")) {
        return Promise.resolve(txlistOk([esTx(), esTx(), esTx()]));
      }
      return Promise.resolve(getCode("0x")); // EOA
    });
    const data = await fetchWalletData(ADDR);
    expect(data.txs.length).toBe(3);
    expect(data.txCount).toBe(3);
    expect(data.isContract).toBe(false);
    expect(data.address).toBe(ADDR);
  });

  it("flags a wallet whose own address has code as a contract/smart wallet", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlist")) return Promise.resolve(txlistOk([esTx()]));
      return Promise.resolve(getCode("0x60806040")); // has code
    });
    const data = await fetchWalletData(ADDR);
    expect(data.isContract).toBe(true);
    expect(data.usedSmartWallet).toBe(true);
  });

  it("treats status 0 / 'No transactions found' as an empty wallet, not an error", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlist")) {
        return Promise.resolve(
          envelope({ status: "0", message: "No transactions found", result: [] }),
        );
      }
      return Promise.resolve(getCode("0x"));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.txCount).toBe(0);
    expect(data.isContract).toBe(false);
  });

  it("throws a typed EtherscanError on a real API error (status 0, other message)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlist")) {
        return Promise.resolve(
          envelope({
            status: "0",
            message: "NOTOK",
            result: "Max rate limit reached",
          }),
        );
      }
      return Promise.resolve(getCode("0x"));
    });
    await expect(fetchWalletData(ADDR)).rejects.toMatchObject({ kind: "api" });
  });

  it("throws a typed EtherscanError on a non-ok HTTP response", async () => {
    fetchMock.mockResolvedValue(envelope({}, 500));
    await expect(fetchWalletData(ADDR)).rejects.toBeInstanceOf(EtherscanError);
  });
});

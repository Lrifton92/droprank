import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWalletData,
  fetchWalletDataViaBlockscoutCompat,
  BLOCKSCOUT_COMPAT_URL,
  BLOCKSCOUT_V2_URL,
  BASE_RPC_URL,
  ETHERSCAN_PAGE_CAP,
  EtherscanError,
  __test,
} from "./etherscan";
import {
  ACROSS_SPOKE_POOL,
  L2_STANDARD_BRIDGE,
  USDC_NATIVE,
} from "../contracts-registry";

const ADDR = "0xabc0000000000000000000000000000000000abc";
const KEY = "TEST_KEY";

/** Build a raw Etherscan v2 txlistinternal item (subset we read). */
function esInternal(over: Record<string, unknown> = {}) {
  return {
    from: "0x2222222222222222222222222222222222222222",
    to: ADDR,
    value: "1000000000000000000", // 1 ETH
    ...over,
  };
}

/** txlistinternal success envelope. */
function internalOk(items: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ status: "1", message: "OK", result: items }) } as Response;
}

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

/** True when this fetch call is the keyless eth_getCode JSON-RPC POST to Base. */
function isRpcGetCode(url: string, init?: RequestInit): boolean {
  return url === BASE_RPC_URL && init?.method === "POST";
}

/** True when this fetch call is the v2 token-transfers endpoint (compat path). */
function isV2TokenTransfers(url: string): boolean {
  return url.startsWith(BLOCKSCOUT_V2_URL) && url.includes("/token-transfers");
}

/** Empty v2 token-transfers page. */
function v2Tokens(items: unknown[] = []) {
  return { ok: true, status: 200, json: async () => ({ items }) } as Response;
}

describe("detectInboundBridge (pure, over txlistinternal items)", () => {
  const det = (items: unknown[]) =>
    __test.detectInboundBridge(items as Parameters<typeof __test.detectInboundBridge>[0], ADDR);

  it("flags an Across SpokePool fill (from = SpokePool, value > 0, to = wallet)", () => {
    expect(det([esInternal({ from: ACROSS_SPOKE_POOL })])).toBe(true);
  });

  it("flags a canonical deposit finalization (from = L2 bridge, value > 0)", () => {
    expect(det([esInternal({ from: L2_STANDARD_BRIDGE })])).toBe(true);
  });

  it("ignores a zero-value internal from a bridge (no real fill)", () => {
    expect(det([esInternal({ from: ACROSS_SPOKE_POOL, value: "0" })])).toBe(false);
  });

  it("ignores internals from non-bridge contracts even with value", () => {
    expect(det([esInternal({ from: USDC_NATIVE })])).toBe(false);
  });

  it("returns false for no internals", () => {
    expect(det([])).toBe(false);
  });
});

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
    // Three calls fire via Promise.all; resolve by URL, not order.
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlistinternal")) return Promise.resolve(internalOk([]));
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
    expect(data.inboundBridge).toBe(false);
  });

  it("sets inboundBridge when an internal Across fill is present", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlistinternal")) {
        return Promise.resolve(internalOk([esInternal({ from: ACROSS_SPOKE_POOL })]));
      }
      if (url.includes("action=txlist")) return Promise.resolve(txlistOk([esTx()]));
      return Promise.resolve(getCode("0x"));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.inboundBridge).toBe(true);
  });

  it("never fails the scan when the internal-tx call errors (inboundBridge falsy)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlistinternal")) return Promise.resolve(envelope({}, 500));
      if (url.includes("action=txlist")) return Promise.resolve(txlistOk([esTx()]));
      return Promise.resolve(getCode("0x"));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.txCount).toBe(1);
    expect(data.inboundBridge).toBe(false);
  });

  it("collects outgoing internal `to` and sets token signals via native actions (FIX A/D)", async () => {
    const AERO = "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43";
    const USDC = USDC_NATIVE;
    const ZERO = "0x0000000000000000000000000000000000000000";
    fetchMock.mockImplementation((url: string) => {
      // tokennfttx must be matched before the generic tokentx substring.
      if (url.includes("action=tokennfttx")) {
        return Promise.resolve(
          internalOk([{ from: ZERO, to: ADDR, contractAddress: "0xnft" }]),
        );
      }
      if (url.includes("action=tokentx")) {
        return Promise.resolve(
          internalOk([{ from: "0x9", to: ADDR, contractAddress: USDC }]),
        );
      }
      if (url.includes("action=txlistinternal")) {
        return Promise.resolve(internalOk([esInternal({ from: ADDR, to: AERO })]));
      }
      if (url.includes("action=txlist")) return Promise.resolve(txlistOk([esTx()]));
      return Promise.resolve(getCode("0x"));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.internalOutTo).toContain(AERO);
    expect(data.receivedUsdc).toBe(true);
    expect(data.mintedNft).toBe(true);
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

  // Deep-history wallets: the txlist page is capped at ETHERSCAN_PAGE_CAP newest
  // txs (sort=desc). A heavy farmer's founding protocol interactions (swap on
  // Aerodrome, lend on Morpho…) sit OLDER than that cap, so a desc-only scan
  // misses them and the quests stay incomplete. When the recent page hits the
  // cap we must also pull the OLDEST page (sort=asc) and merge.
  it("also fetches the oldest page when the recent page hits the cap, surfacing a buried founding tx", async () => {
    const AERO = "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43";
    // recent page = exactly CAP txs, none touching Aerodrome (founding swap is older)
    const recent = Array.from({ length: ETHERSCAN_PAGE_CAP }, () => esTx());
    // oldest page = the founding Aerodrome swap, buried beyond the cap
    const oldest = [esTx({ to: AERO, hash: "0xaerodromefounding" })];
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlistinternal")) return Promise.resolve(internalOk([]));
      if (url.includes("action=txlist")) {
        return Promise.resolve(
          txlistOk(url.includes("sort=asc") ? oldest : recent),
        );
      }
      return Promise.resolve(getCode("0x"));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.txs.some((t) => t.to === AERO)).toBe(true);
  });

  it("does not fetch the oldest page when the recent page is under the cap", async () => {
    let ascCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlistinternal")) return Promise.resolve(internalOk([]));
      if (url.includes("action=txlist")) {
        if (url.includes("sort=asc")) {
          ascCalls++;
          return Promise.resolve(txlistOk([]));
        }
        return Promise.resolve(txlistOk([esTx(), esTx()])); // under cap
      }
      return Promise.resolve(getCode("0x"));
    });
    await fetchWalletData(ADDR);
    expect(ascCalls).toBe(0);
  });

  it("keeps the recent page when the oldest-page (asc) pull fails — never fails the scan", async () => {
    const recent = Array.from({ length: ETHERSCAN_PAGE_CAP }, () => esTx());
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlistinternal")) return Promise.resolve(internalOk([]));
      if (url.includes("action=txlist")) {
        if (url.includes("sort=asc")) return Promise.resolve(envelope({}, 500)); // asc fails
        return Promise.resolve(txlistOk(recent));
      }
      return Promise.resolve(getCode("0x"));
    });
    const data = await fetchWalletData(ADDR);
    expect(data.txCount).toBe(ETHERSCAN_PAGE_CAP); // recent kept, scan did not throw
  });

  it("dedupes by hash when the same tx appears in both the recent and oldest pages", async () => {
    const shared = esTx({ hash: "0xshared" });
    const recent = [shared, ...Array.from({ length: ETHERSCAN_PAGE_CAP - 1 }, () => esTx())];
    const oldest = [shared, esTx({ hash: "0xoldonly" })];
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("action=txlistinternal")) return Promise.resolve(internalOk([]));
      if (url.includes("action=txlist")) {
        return Promise.resolve(
          txlistOk(url.includes("sort=asc") ? oldest : recent),
        );
      }
      return Promise.resolve(getCode("0x"));
    });
    const data = await fetchWalletData(ADDR);
    const sharedCount = data.txs.filter((t) => t.hash === "0xshared").length;
    expect(sharedCount).toBe(1);
    expect(data.txs.some((t) => t.hash === "0xoldonly")).toBe(true);
  });
});

describe("fetchWalletDataViaBlockscoutCompat (keyless)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const prevKey = process.env.ETHERSCAN_API_KEY;

  beforeEach(() => {
    // No key in env: the compat path must NOT require one.
    delete process.env.ETHERSCAN_API_KEY;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevKey === undefined) delete process.env.ETHERSCAN_API_KEY;
    else process.env.ETHERSCAN_API_KEY = prevKey;
  });

  it("fetches txs from the Blockscout host (no apikey) and code from Base RPC", async () => {
    const accountUrls: string[] = [];
    let rpcPost: { url: string; init?: RequestInit } | null = null;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) {
        rpcPost = { url, init };
        return Promise.resolve(getCode("0x"));
      }
      if (isV2TokenTransfers(url)) return Promise.resolve(v2Tokens());
      accountUrls.push(url);
      if (url.includes("action=txlistinternal")) return Promise.resolve(internalOk([]));
      return Promise.resolve(txlistOk([esTx()]));
    });
    const data = await fetchWalletDataViaBlockscoutCompat(ADDR);
    expect(data.txCount).toBe(1);
    // Exactly two Etherscan-compat account calls: txlist + txlistinternal, both
    // keyless. The token-transfer pass uses the v2 endpoint, not these actions.
    expect(accountUrls.length).toBe(2);
    const txlistUrl = accountUrls.find((u) => !u.includes("txlistinternal"))!;
    const internalUrl = accountUrls.find((u) => u.includes("txlistinternal"))!;
    expect(txlistUrl.startsWith(BLOCKSCOUT_COMPAT_URL)).toBe(true);
    expect(txlistUrl).not.toContain("apikey=");
    expect(internalUrl.startsWith(BLOCKSCOUT_COMPAT_URL)).toBe(true);
    expect(internalUrl).not.toContain("apikey=");
    // eth_getCode is a JSON-RPC POST to Base, NOT the Blockscout proxy module.
    expect(rpcPost).not.toBeNull();
    expect(rpcPost!.url).toBe(BASE_RPC_URL);
    const sentBody = JSON.parse(String(rpcPost!.init!.body));
    expect(sentBody.method).toBe("eth_getCode");
    expect(sentBody.params).toEqual([ADDR.toLowerCase(), "latest"]);
  });

  it("reads internal fills even when the compat status is '2' (partially processed)", async () => {
    // Blockscout-compat returns status "2" with a populated array; the array must
    // still be read (verified live on Soufian's wallet 2026-06-06).
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) return Promise.resolve(getCode("0x"));
      if (url.includes("action=txlistinternal")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: "2",
            message: "Some internal transactions ... not yet been processed",
            result: [esInternal({ from: ACROSS_SPOKE_POOL })],
          }),
        } as Response);
      }
      return Promise.resolve(txlistOk([esTx()]));
    });
    const data = await fetchWalletDataViaBlockscoutCompat(ADDR);
    expect(data.inboundBridge).toBe(true);
  });

  it("derives token signals via the v2 endpoint, not tokentx actions (FIX D)", async () => {
    const USDC = USDC_NATIVE;
    const ZERO = "0x0000000000000000000000000000000000000000";
    let usedTokenAction = false;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) return Promise.resolve(getCode("0x"));
      if (isV2TokenTransfers(url)) {
        return Promise.resolve(
          v2Tokens([
            // item-level `type` is the transfer kind; the standard is token.type.
            { from: { hash: "0x9" }, to: { hash: ADDR }, type: "token_transfer", token: { address_hash: USDC, type: "ERC-20" } },
            { from: { hash: ZERO }, to: { hash: ADDR }, type: "token_minting", token: { address_hash: "0xnft", type: "ERC-1155" } },
          ]),
        );
      }
      if (url.includes("action=tokentx") || url.includes("action=tokennfttx")) {
        usedTokenAction = true;
        return Promise.resolve(internalOk([]));
      }
      if (url.includes("action=txlistinternal")) return Promise.resolve(internalOk([]));
      return Promise.resolve(txlistOk([esTx()]));
    });
    const data = await fetchWalletDataViaBlockscoutCompat(ADDR);
    expect(data.receivedUsdc).toBe(true);
    expect(data.mintedNft).toBe(true);
    // The compat path must NOT hit the broken tokentx/tokennfttx compat actions.
    expect(usedTokenAction).toBe(false);
  });

  it("reports a contract via the Base RPC eth_getCode (bytecode present)", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) return Promise.resolve(getCode("0x60806040"));
      return Promise.resolve(txlistOk([esTx()]));
    });
    const data = await fetchWalletDataViaBlockscoutCompat(ADDR);
    expect(data.isContract).toBe(true);
    expect(data.usedSmartWallet).toBe(true);
  });

  it("reports an EOA via the Base RPC eth_getCode ('0x')", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) return Promise.resolve(getCode("0x"));
      return Promise.resolve(txlistOk([esTx()]));
    });
    const data = await fetchWalletDataViaBlockscoutCompat(ADDR);
    expect(data.isContract).toBe(false);
  });

  it("treats a flaky Base RPC (non-ok) as EOA rather than failing the scan", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) return Promise.resolve(envelope({}, 503));
      return Promise.resolve(txlistOk([esTx()]));
    });
    const data = await fetchWalletDataViaBlockscoutCompat(ADDR);
    expect(data.txCount).toBe(1);
    expect(data.isContract).toBe(false);
  });

  it("derives method from methodId when functionName is absent (compat lacks it)", async () => {
    // Blockscout-compat omits functionName; methodId carries the selector.
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) return Promise.resolve(getCode("0x"));
      return Promise.resolve(
        txlistOk([{ ...esTx(), functionName: undefined, methodId: "0xa9059cbb" }]),
      );
    });
    const data = await fetchWalletDataViaBlockscoutCompat(ADDR);
    expect(data.txs[0].method).toBe("0xa9059cbb");
  });

  it("treats status 0 / 'No transactions found' as an empty wallet", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) return Promise.resolve(getCode("0x"));
      return Promise.resolve(
        envelope({ status: "0", message: "No transactions found", result: [] }),
      );
    });
    const data = await fetchWalletDataViaBlockscoutCompat(ADDR);
    expect(data.txCount).toBe(0);
    expect(data.isContract).toBe(false);
  });

  it("surfaces a real API error (status 0, other message) as EtherscanError", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isRpcGetCode(url, init)) return Promise.resolve(getCode("0x"));
      return Promise.resolve(
        envelope({ status: "0", message: "NOTOK", result: "rate limited" }),
      );
    });
    await expect(
      fetchWalletDataViaBlockscoutCompat(ADDR),
    ).rejects.toMatchObject({ kind: "api" });
  });
});

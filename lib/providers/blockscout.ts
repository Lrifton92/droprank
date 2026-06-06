import { isAddress } from "viem";
import type { Tx, WalletData } from "../types";
import {
  COINBASE_SMART_WALLET_FACTORY_V1,
  COINBASE_SMART_WALLET_FACTORY_V1_1,
  BRIDGE_CONTRACTS,
} from "../contracts-registry";

/**
 * Keyless Blockscout (Base) API client.
 * Base URL: https://base.blockscout.com/api/v2
 *
 * Provides the aggregated WalletData needed by scoring/quests:
 *  - paginated tx list (capped), tx count, first tx, contract detection,
 *    Coinbase Smart Wallet detection.
 *
 * All network calls honor an optional AbortSignal, time out, and retry transient
 * failures. Errors are surfaced as a typed BlockscoutError.
 */

const BASE_URL = "https://base.blockscout.com/api/v2";

/** Cap on fetched txs (scoring tiers top out well below this). */
export const TX_CAP = 3000;
const PAGE_SIZE_ESTIMATE = 50; // Blockscout returns ~50 per page
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

export class BlockscoutError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "invalid_address"
      | "http"
      | "timeout"
      | "network"
      | "aborted",
    readonly status?: number,
  ) {
    super(message);
    this.name = "BlockscoutError";
  }
}

interface V2AddressRef {
  hash: string;
  is_contract?: boolean;
}

interface V2Tx {
  hash: string;
  from: V2AddressRef | null;
  to: V2AddressRef | null;
  value: string;
  timestamp: string;
  method: string | null;
  created_contract: V2AddressRef | null;
}

interface V2TxPage {
  items: V2Tx[];
  next_page_params: Record<string, string | number> | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch JSON with timeout + retry. A 404 is returned to the caller (not retried,
 * not thrown) because some endpoints use 404 for "no data" (e.g. unused address).
 */
async function getJson<T>(
  url: string,
  signal: AbortSignal | undefined,
  allow404 = false,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 404 && allow404) {
        return { ok: false, status: 404, body: null };
      }
      if (!res.ok) {
        // Retry 5xx/429; fail fast on other 4xx.
        if ((res.status >= 500 || res.status === 429) && attempt < MAX_RETRIES) {
          await delay(RETRY_BASE_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new BlockscoutError(
          `Blockscout HTTP ${res.status}`,
          "http",
          res.status,
        );
      }
      const body = (await res.json()) as T;
      return { ok: true, status: res.status, body };
    } catch (e) {
      if (signal?.aborted) {
        throw new BlockscoutError("Request aborted by caller", "aborted");
      }
      if (e instanceof BlockscoutError) throw e;
      lastErr = e;
      const aborted = e instanceof Error && e.name === "AbortError";
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      throw new BlockscoutError(
        aborted ? "Blockscout request timed out" : "Blockscout network error",
        aborted ? "timeout" : "network",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new BlockscoutError(
    `Blockscout request failed: ${String(lastErr)}`,
    "network",
  );
}

/** Blockscout v2 internal-transaction item (subset we read). */
interface V2InternalTx {
  from: V2AddressRef | null;
  to: V2AddressRef | null;
  value: string;
}

interface V2InternalPage {
  items: V2InternalTx[];
}

/**
 * Detect an inbound bridge fill from v2 internal txs: an internal tx whose `from`
 * is a known bridge contract delivering value (> 0) to the wallet. Covers
 * canonical deposit finalizations and Across SpokePool fills (neither appears in
 * the normal tx list). Pure; value parse failures count as 0 (no fill).
 */
function detectInboundBridge(items: V2InternalTx[], address: string): boolean {
  const addr = address.toLowerCase();
  for (const it of items) {
    const from = (it.from?.hash ?? "").toLowerCase();
    if (!BRIDGE_CONTRACTS.has(from)) continue;
    if ((it.to?.hash ?? "").toLowerCase() !== addr) continue;
    try {
      if (BigInt(it.value || "0") > BigInt(0)) return true;
    } catch {
      // Malformed value -> treat as 0.
    }
  }
  return false;
}

/**
 * Inbound-bridge signal from the v2 internal-transactions endpoint. NEVER-FAIL:
 * one page is enough (bridge fills are few) and any error returns false so a
 * flaky call never breaks the scan. 404 (unused address) -> false.
 */
async function fetchInboundBridge(
  address: string,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  try {
    const res = await getJson<V2InternalPage>(
      `${BASE_URL}/addresses/${address}/internal-transactions`,
      signal,
      true,
    );
    return detectInboundBridge(res.body?.items ?? [], address);
  } catch {
    return false;
  }
}

/** Map a Blockscout v2 tx to our internal Tx. */
function normalizeTx(v: V2Tx): Tx {
  const created = v.created_contract != null;
  return {
    hash: v.hash,
    from: (v.from?.hash ?? "").toLowerCase(),
    to: v.to ? v.to.hash.toLowerCase() : null,
    value: v.value ?? "0",
    timestamp: Math.floor(new Date(v.timestamp).getTime() / 1000),
    method: v.method ? v.method.toLowerCase() : null,
    toIsContract: v.to?.is_contract === true,
    createsContract: created || v.to === null,
  };
}

function buildPageUrl(
  address: string,
  next: Record<string, string | number> | null,
): string {
  const u = new URL(`${BASE_URL}/addresses/${address}/transactions`);
  if (next) {
    for (const [k, val] of Object.entries(next)) {
      u.searchParams.set(k, String(val));
    }
  }
  return u.toString();
}

/**
 * Fetch and aggregate everything scoring/quests need for an address.
 * @throws BlockscoutError on invalid address, HTTP error, timeout, or abort.
 */
export async function fetchWalletData(
  address: string,
  signal?: AbortSignal,
): Promise<WalletData> {
  if (!isAddress(address)) {
    throw new BlockscoutError(`Invalid address: ${address}`, "invalid_address");
  }
  const addr = address.toLowerCase();

  // 1. Address info (contract detection) + inbound-bridge internal pass, parallel.
  //    404 on info => unused address, treat as EOA. The internal pass never fails.
  const [info, inboundBridge] = await Promise.all([
    getJson<{ is_contract?: boolean }>(`${BASE_URL}/addresses/${addr}`, signal, true),
    fetchInboundBridge(addr, signal),
  ]);
  const isContract = info.body?.is_contract === true;

  // 2. Paginated tx list, capped.
  const txs: Tx[] = [];
  let next: Record<string, string | number> | null = null;
  let usedSmartWallet = false;

  const maxPages = Math.ceil(TX_CAP / PAGE_SIZE_ESTIMATE) + 2;
  for (let page = 0; page < maxPages; page++) {
    const page_result: { body: V2TxPage | null } = await getJson<V2TxPage>(
      buildPageUrl(addr, next),
      signal,
    );
    const body = page_result.body;
    const items = body?.items ?? [];
    for (const v of items) {
      const t = normalizeTx(v);
      txs.push(t);
      // Smart-wallet detection: a deployment tx targeting a Coinbase factory.
      if (
        t.to === COINBASE_SMART_WALLET_FACTORY_V1 ||
        t.to === COINBASE_SMART_WALLET_FACTORY_V1_1
      ) {
        usedSmartWallet = true;
      }
    }
    next = body?.next_page_params ?? null;
    if (!next || txs.length >= TX_CAP) break;
  }

  return {
    address: addr,
    txs,
    txCount: txs.length,
    isContract,
    // A checked address that is itself a smart-wallet contract also counts.
    usedSmartWallet: usedSmartWallet || isContract,
    inboundBridge,
    // Basename ownership is a reverse-resolution read handled by the API route;
    // default false here (the pure data layer stays keyless/tx-only).
    hasBasename: false,
  };
}

/** Internal exports for unit tests only. */
export const __test = { normalizeTx };

import { isAddress } from "viem";
import type { Tx, WalletData } from "../types";
import {
  COINBASE_SMART_WALLET_FACTORY_V1,
  COINBASE_SMART_WALLET_FACTORY_V1_1,
} from "../contracts-registry";
import {
  detectInboundBridge,
  collectInternalOutTo,
  detectReceivedUsdc,
  detectMintedNft,
  type InternalRow,
  type TokenTransferRow,
} from "./wallet-signals";

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
 * Blockscout v2 token-transfer item (subset we read).
 * NB: the item-level `type` is the TRANSFER kind ("token_minting"/"token_transfer"),
 * NOT the token standard — the standard ("ERC-20"/"ERC-721"/"ERC-1155") lives on
 * `token.type` (verified live 2026-06-06). We read `token.type` for the standard.
 */
interface V2TokenTransfer {
  from: V2AddressRef | null;
  to: V2AddressRef | null;
  token: { address_hash?: string; address?: string; type?: string } | null;
}

interface V2TokenTransferPage {
  items: V2TokenTransfer[];
}

/** Adapt v2 internal items to the shared {@link InternalRow} shape. */
function toInternalRows(items: V2InternalTx[]): InternalRow[] {
  return items.map((it) => ({
    from: it.from?.hash ?? null,
    to: it.to?.hash ?? null,
    value: it.value,
  }));
}

/** Adapt v2 token-transfer items to the shared {@link TokenTransferRow} shape. */
function toTokenRows(items: V2TokenTransfer[]): TokenTransferRow[] {
  return items.map((it) => ({
    from: it.from?.hash ?? null,
    to: it.to?.hash ?? null,
    token: it.token?.address_hash ?? it.token?.address ?? null,
    type: it.token?.type ?? null, // token standard, NOT the item-level transfer kind
  }));
}

/** Signals derived from the never-fail internal + token-transfer passes. */
interface ExtraSignals {
  inboundBridge: boolean;
  internalOutTo: string[];
  receivedUsdc: boolean;
  mintedNft: boolean;
}

const NO_SIGNALS: ExtraSignals = {
  inboundBridge: false,
  internalOutTo: [],
  receivedUsdc: false,
  mintedNft: false,
};

/**
 * Internal-tx signals from the v2 internal-transactions endpoint. NEVER-FAIL: one
 * page is enough (bridge fills are few; one internal hit per protocol suffices) and
 * any error returns empty signals so a flaky call never breaks the scan.
 */
async function fetchInternalSignals(
  address: string,
  signal: AbortSignal | undefined,
): Promise<{ inboundBridge: boolean; internalOutTo: string[] }> {
  try {
    const res = await getJson<V2InternalPage>(
      `${BASE_URL}/addresses/${address}/internal-transactions`,
      signal,
      true,
    );
    const rows = toInternalRows(res.body?.items ?? []);
    return {
      inboundBridge: detectInboundBridge(rows, address),
      internalOutTo: collectInternalOutTo(rows, address),
    };
  } catch {
    return { inboundBridge: false, internalOutTo: [] };
  }
}

/**
 * Token-transfer signals (FIX D). One unfiltered v2 page mixes ERC-20/721/1155, so
 * a single call surfaces both a native-USDC receipt and an NFT mint for typical
 * wallets. NEVER-FAIL: any error returns false signals. 404 -> false.
 */
async function fetchTokenSignals(
  address: string,
  signal: AbortSignal | undefined,
): Promise<{ receivedUsdc: boolean; mintedNft: boolean }> {
  try {
    const res = await getJson<V2TokenTransferPage>(
      `${BASE_URL}/addresses/${address}/token-transfers`,
      signal,
      true,
    );
    const rows = toTokenRows(res.body?.items ?? []);
    return {
      receivedUsdc: detectReceivedUsdc(rows, address),
      mintedNft: detectMintedNft(rows, address),
    };
  } catch {
    return { receivedUsdc: false, mintedNft: false };
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

  // 1. Address info (contract detection) + internal-tx pass (bridge + outgoing
  //    targets) + token-transfer pass (USDC receipt, NFT mint), all parallel.
  //    404 on info => unused address, treat as EOA. The extra passes never fail.
  const [info, internalSignals, tokenSignals] = await Promise.all([
    getJson<{ is_contract?: boolean }>(`${BASE_URL}/addresses/${addr}`, signal, true),
    fetchInternalSignals(addr, signal),
    fetchTokenSignals(addr, signal),
  ]);
  const isContract = info.body?.is_contract === true;
  const extra: ExtraSignals = { ...NO_SIGNALS, ...internalSignals, ...tokenSignals };

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
    inboundBridge: extra.inboundBridge,
    internalOutTo: extra.internalOutTo,
    receivedUsdc: extra.receivedUsdc,
    mintedNft: extra.mintedNft,
    // Basename ownership is a reverse-resolution read handled by the API route;
    // default false here (the pure data layer stays keyless/tx-only).
    hasBasename: false,
  };
}

/** Internal exports for unit tests only. */
export const __test = { normalizeTx, toInternalRows, toTokenRows };

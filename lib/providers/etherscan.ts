import { isAddress } from "viem";
import type { Tx, WalletData } from "../types";
import { BADGE_CHAIN_ID } from "../badge-abi";
import {
  COINBASE_SMART_WALLET_FACTORY_V1,
  COINBASE_SMART_WALLET_FACTORY_V1_1,
} from "../contracts-registry";

/**
 * Etherscan v2 (multichain) API client — PRIMARY data source.
 * Base URL: https://api.etherscan.io/v2/api?chainid={CHAIN}
 *
 * Why primary: Etherscan returns up to 10000 txs in a SINGLE call (offset=10000),
 * versus Blockscout's ~50/page cursor pagination (25-60 sequential calls). This
 * collapses a ~53s cold scan to a single round-trip.
 *
 * Provides the same aggregated WalletData as blockscout.ts:
 *  - capped tx list, tx count, contract detection (eth_getCode), Coinbase Smart
 *    Wallet detection (factory match). hasBasename stays a route-level concern.
 *
 * Requires ETHERSCAN_API_KEY (server-side env). The caller (score-address.ts)
 * falls back to Blockscout when the key is missing or this client throws.
 *
 * All calls honor an optional AbortSignal, time out, and retry transient failures.
 * Errors surface as a typed EtherscanError.
 */

const BASE_URL = "https://api.etherscan.io/v2/api";

/**
 * Cap on fetched txs in one call. Etherscan caps a single page at 10000; scoring
 * tiers saturate far below this (txCount maxes at 1000, contracts at 30, etc.), so
 * a wallet with >10000 txs is truncated WITHOUT affecting its score. Documented
 * limit vs Blockscout's cursor pagination, which could in theory exceed this.
 */
export const ETHERSCAN_PAGE_CAP = 10000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

export class EtherscanError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "invalid_address"
      | "no_api_key"
      | "http"
      | "api"
      | "timeout"
      | "network"
      | "aborted",
    readonly status?: number,
  ) {
    super(message);
    this.name = "EtherscanError";
  }
}

/** Raw Etherscan v2 txlist item (subset we read). */
interface EsTx {
  hash: string;
  timeStamp: string;
  from: string;
  /** Empty string "" on contract creation. */
  to: string;
  /** Value in wei, decimal string. */
  value: string;
  /** Call data; "0x" or "" for a plain transfer. */
  input?: string;
  /** Set (non-empty) on the tx that created a contract. */
  contractAddress?: string;
  /** Decoded signature e.g. "transfer(address,uint256)" when known, else "". */
  functionName?: string;
  /** 4-byte selector e.g. "0xa9059cbb"; "0x" for a plain transfer. */
  methodId?: string;
}

/** Etherscan envelope. status "1" = ok; "0" = empty result OR error (see message). */
interface EsEnvelope<T> {
  status: string;
  message: string;
  result: T;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function chainId(): number {
  return BADGE_CHAIN_ID;
}

function apiKey(): string {
  const k = process.env.ETHERSCAN_API_KEY?.trim();
  if (!k) {
    throw new EtherscanError("ETHERSCAN_API_KEY is not set", "no_api_key");
  }
  return k;
}

/**
 * Fetch + parse an Etherscan envelope with timeout + retry.
 *
 * Etherscan returns HTTP 200 with status "0" both for "no results" (benign) and
 * for real errors (rate limit, invalid key). The caller disambiguates via the
 * envelope; here we only retry on transport/5xx/429 transport failures.
 */
async function getEnvelope<T>(
  url: string,
  signal: AbortSignal | undefined,
): Promise<EsEnvelope<T>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && attempt < MAX_RETRIES) {
          await delay(RETRY_BASE_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new EtherscanError(
          `Etherscan HTTP ${res.status}`,
          "http",
          res.status,
        );
      }
      return (await res.json()) as EsEnvelope<T>;
    } catch (e) {
      if (signal?.aborted) {
        throw new EtherscanError("Request aborted by caller", "aborted");
      }
      if (e instanceof EtherscanError) throw e;
      lastErr = e;
      const aborted = e instanceof Error && e.name === "AbortError";
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }
      throw new EtherscanError(
        aborted ? "Etherscan request timed out" : "Etherscan network error",
        aborted ? "timeout" : "network",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new EtherscanError(
    `Etherscan request failed: ${String(lastErr)}`,
    "network",
  );
}

/** True when the call data carries a method (i.e. not a plain ETH transfer). */
function hasCallData(v: EsTx): boolean {
  const input = v.input ?? "";
  if (input !== "" && input !== "0x") return true;
  const mid = v.methodId ?? "";
  if (mid !== "" && mid !== "0x") return true;
  return (v.functionName ?? "") !== "";
}

/**
 * Derive a lowercase method name like Blockscout's decoded `method`.
 * Prefers functionName ("transfer(address,uint256)" -> "transfer"); falls back
 * to the raw methodId selector when only that is present; null for plain transfers.
 */
function deriveMethod(v: EsTx): string | null {
  const fn = (v.functionName ?? "").trim();
  if (fn) {
    const paren = fn.indexOf("(");
    return (paren >= 0 ? fn.slice(0, paren) : fn).trim().toLowerCase() || null;
  }
  const mid = (v.methodId ?? "").trim();
  if (mid && mid !== "0x") return mid.toLowerCase();
  return null;
}

/**
 * Map an Etherscan v2 tx to our internal Tx.
 *
 * Heuristics (Etherscan txlist lacks the contract flags Blockscout decodes):
 *  - toIsContract: TRUE when `to` is set AND the tx carries call data. Rationale:
 *    a call with data to an address is almost always a contract interaction.
 *    Limits vs Blockscout (which knew exactly): (a) a plain ETH transfer to a
 *    contract is seen as EOA (false negative) — only affects uniqueContracts and
 *    the mint-nft quest, which both require a decoded method anyway; (b) call data
 *    sent to an EOA would be a false positive, but that is effectively never done.
 *  - createsContract: `to` empty OR `contractAddress` present (Etherscan's own
 *    creation markers), matching Blockscout's `created_contract || to===null`.
 */
function normalizeTx(v: EsTx): Tx {
  const toEmpty = (v.to ?? "") === "";
  const createdContract = (v.contractAddress ?? "") !== "";
  return {
    hash: v.hash,
    from: (v.from ?? "").toLowerCase(),
    to: toEmpty ? null : v.to.toLowerCase(),
    value: v.value ?? "0",
    timestamp: Number(v.timeStamp),
    method: deriveMethod(v),
    toIsContract: !toEmpty && hasCallData(v),
    createsContract: createdContract || toEmpty,
  };
}

/** Internal export for tests only. */
export const __test = { normalizeTx, deriveMethod, hasCallData };

function buildTxlistUrl(address: string): string {
  const u = new URL(BASE_URL);
  u.searchParams.set("chainid", String(chainId()));
  u.searchParams.set("module", "account");
  u.searchParams.set("action", "txlist");
  u.searchParams.set("address", address);
  u.searchParams.set("startblock", "0");
  u.searchParams.set("endblock", "99999999");
  u.searchParams.set("page", "1");
  u.searchParams.set("offset", String(ETHERSCAN_PAGE_CAP));
  u.searchParams.set("sort", "desc");
  u.searchParams.set("apikey", apiKey());
  return u.toString();
}

function buildGetCodeUrl(address: string): string {
  const u = new URL(BASE_URL);
  u.searchParams.set("chainid", String(chainId()));
  u.searchParams.set("module", "proxy");
  u.searchParams.set("action", "eth_getCode");
  u.searchParams.set("address", address);
  u.searchParams.set("tag", "latest");
  u.searchParams.set("apikey", apiKey());
  return u.toString();
}

/**
 * Fetch the tx list for an address. Returns [] for an unused wallet.
 * @throws EtherscanError on a real API error (rate limit, bad key, ...).
 */
async function fetchTxs(
  address: string,
  signal: AbortSignal | undefined,
): Promise<Tx[]> {
  const env = await getEnvelope<EsTx[] | string>(
    buildTxlistUrl(address),
    signal,
  );
  if (env.status === "1") {
    const items = Array.isArray(env.result) ? env.result : [];
    return items.map(normalizeTx);
  }
  // status "0": disambiguate "no transactions" (benign) from a real error.
  const msg = (env.message || "").toLowerCase();
  const resultStr =
    typeof env.result === "string" ? env.result.toLowerCase() : "";
  if (msg.includes("no transactions found") || resultStr.includes("no transactions")) {
    return [];
  }
  throw new EtherscanError(
    `Etherscan API error: ${env.message}${
      typeof env.result === "string" ? ` (${env.result})` : ""
    }`,
    "api",
  );
}

/**
 * Is the scanned address itself a contract? Uses eth_getCode via the proxy module
 * (same Etherscan source — no Blockscout dependency). Empty code ("0x") = EOA.
 * eth_getCode envelopes carry the bytecode directly in `result` (no status "1").
 */
async function fetchIsContract(
  address: string,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  const env = await getEnvelope<string>(buildGetCodeUrl(address), signal);
  // JSON-RPC proxy: success => result is the hex bytecode; error => result absent.
  const code = typeof env.result === "string" ? env.result : "";
  return code !== "" && code !== "0x";
}

/**
 * Fetch and aggregate everything scoring/quests need, via Etherscan v2.
 * Shape-identical to blockscout.fetchWalletData.
 * @throws EtherscanError on invalid address, missing key, API error, timeout, abort.
 */
export async function fetchWalletData(
  address: string,
  signal?: AbortSignal,
): Promise<WalletData> {
  if (!isAddress(address)) {
    throw new EtherscanError(`Invalid address: ${address}`, "invalid_address");
  }
  // Fail fast (and let the caller fall back) when no key is configured.
  apiKey();

  const addr = address.toLowerCase();

  // Two parallel calls: the tx list (heavy) and the code check (light).
  const [txs, isContract] = await Promise.all([
    fetchTxs(addr, signal),
    fetchIsContract(addr, signal),
  ]);

  let usedSmartWallet = false;
  for (const t of txs) {
    if (
      t.to === COINBASE_SMART_WALLET_FACTORY_V1 ||
      t.to === COINBASE_SMART_WALLET_FACTORY_V1_1
    ) {
      usedSmartWallet = true;
      break;
    }
  }

  return {
    address: addr,
    txs,
    txCount: txs.length,
    isContract,
    usedSmartWallet: usedSmartWallet || isContract,
    // Basename ownership is resolved at the route level (quest-derived in v1).
    hasBasename: false,
  };
}

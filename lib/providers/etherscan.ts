import { isAddress } from "viem";
import type { Tx, WalletData } from "../types";
import { BADGE_CHAIN_ID } from "../badge-abi";
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
 * Blockscout's Etherscan-compatible API (Base, keyless). Same `module=account&
 * action=txlist` envelope (status/message/result) and the same `module=proxy&
 * action=eth_getCode` proxy as Etherscan, so the entire client below is reused
 * verbatim with this base URL — only the URL and the (absent) API key differ.
 *
 * Why: it returns ~1255 txs in ONE ~500ms call vs Blockscout v2's cursor
 * pagination (25+ sequential round-trips, ~34s cold). See score-address.ts chain.
 * Note: it does NOT return `functionName`, but `deriveMethod` already falls back
 * to `methodId`, so the normalized Tx is unaffected.
 */
export const BLOCKSCOUT_COMPAT_URL = "https://base.blockscout.com/api";

/**
 * Blockscout v2 base, used by the compat path for the token-transfer pass: the
 * Etherscan-compat `action=tokentx`/`tokennfttx` actions return an error envelope
 * ("Something went wrong" — verified 2026-06-06) on this host, whereas the v2
 * `/addresses/{a}/token-transfers` endpoint serves a mixed ERC-20/721/1155 page.
 */
export const BLOCKSCOUT_V2_URL = "https://base.blockscout.com/api/v2";

/** Per-call options to retarget the client at a different Etherscan-compatible host. */
interface ClientOptions {
  /** Override the API base URL (default: Etherscan v2). */
  baseUrl?: string;
  /** When false, no apikey param is sent and a missing key is not an error. */
  requireApiKey?: boolean;
  /**
   * Resolve eth_getCode via a direct JSON-RPC POST to {@link BASE_RPC_URL} instead
   * of the `module=proxy&action=eth_getCode` endpoint. Blockscout's Etherscan-compat
   * API rejects that proxy module ("Unknown module"), so the keyless compat path
   * uses the public Base RPC instead. Etherscan's own path keeps module=proxy.
   */
  getCodeViaRpc?: boolean;
  /**
   * Resolve the token-transfer pass (USDC receipt + NFT mint) via the Blockscout v2
   * `/token-transfers` endpoint instead of the Etherscan `tokentx`/`tokennfttx`
   * actions. The compat host's tokentx actions error, so the keyless compat path
   * uses v2; Etherscan's own path keeps the native actions.
   */
  tokenSignalsViaV2?: boolean;
}

/** Public Base mainnet JSON-RPC, used for eth_getCode on the keyless compat path. */
export const BASE_RPC_URL = "https://mainnet.base.org";

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

/** Raw Etherscan v2 txlistinternal item (subset we read). */
interface EsInternalTx {
  /** Originating address (lowercased on read); a bridge contract for a fill. */
  from: string;
  /** Beneficiary; the scanned wallet for an inbound fill. */
  to: string;
  /** Value in wei, decimal string. */
  value: string;
}

/** Adapt Etherscan internal items to the shared {@link InternalRow} shape. */
function toInternalRows(items: EsInternalTx[]): InternalRow[] {
  return items.map((it) => ({ from: it.from ?? null, to: it.to ?? null, value: it.value }));
}

/**
 * Raw Etherscan v2 tokentx (ERC-20) and tokennfttx (ERC-721) item (subset we read).
 * Etherscan splits token transfers by standard across actions; the ERC-20 action
 * has no `tokenID`, the NFT actions do. We tag `type` per source action.
 */
interface EsTokenTx {
  from: string;
  to: string;
  contractAddress: string;
}

/** Internal export for tests only. */
export const __test = {
  normalizeTx,
  deriveMethod,
  hasCallData,
  detectInboundBridge: (items: EsInternalTx[], address: string) =>
    detectInboundBridge(toInternalRows(items), address),
};

function buildTxlistUrl(address: string, opts: ClientOptions): string {
  const u = new URL(opts.baseUrl ?? BASE_URL);
  u.searchParams.set("chainid", String(chainId()));
  u.searchParams.set("module", "account");
  u.searchParams.set("action", "txlist");
  u.searchParams.set("address", address);
  u.searchParams.set("startblock", "0");
  u.searchParams.set("endblock", "99999999");
  u.searchParams.set("page", "1");
  u.searchParams.set("offset", String(ETHERSCAN_PAGE_CAP));
  u.searchParams.set("sort", "desc");
  if (opts.requireApiKey !== false) u.searchParams.set("apikey", apiKey());
  return u.toString();
}

/**
 * Internal-tx list URL (Etherscan-compat `module=account&action=txlistinternal`).
 * One page, offset 10000 (same cap as txlist) — bridge fills are few, so a single
 * page covers every realistic wallet without adding cold-scan round-trips.
 */
function buildTxlistInternalUrl(address: string, opts: ClientOptions): string {
  const u = new URL(opts.baseUrl ?? BASE_URL);
  u.searchParams.set("chainid", String(chainId()));
  u.searchParams.set("module", "account");
  u.searchParams.set("action", "txlistinternal");
  u.searchParams.set("address", address);
  u.searchParams.set("startblock", "0");
  u.searchParams.set("endblock", "99999999");
  u.searchParams.set("page", "1");
  u.searchParams.set("offset", String(ETHERSCAN_PAGE_CAP));
  u.searchParams.set("sort", "desc");
  if (opts.requireApiKey !== false) u.searchParams.set("apikey", apiKey());
  return u.toString();
}

function buildGetCodeUrl(address: string, opts: ClientOptions): string {
  const u = new URL(opts.baseUrl ?? BASE_URL);
  u.searchParams.set("chainid", String(chainId()));
  u.searchParams.set("module", "proxy");
  u.searchParams.set("action", "eth_getCode");
  u.searchParams.set("address", address);
  u.searchParams.set("tag", "latest");
  if (opts.requireApiKey !== false) u.searchParams.set("apikey", apiKey());
  return u.toString();
}

/**
 * Fetch the tx list for an address. Returns [] for an unused wallet.
 * @throws EtherscanError on a real API error (rate limit, bad key, ...).
 */
async function fetchTxs(
  address: string,
  signal: AbortSignal | undefined,
  opts: ClientOptions,
): Promise<Tx[]> {
  const env = await getEnvelope<EsTx[] | string>(
    buildTxlistUrl(address, opts),
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
 * Internal-tx signals from the internal-tx list: inbound bridge fill (existing) +
 * the wallet's OUTGOING internal `to` targets (FIX A, smart-wallet protocol calls).
 * NEVER-FAIL: any API/transport error returns empty signals (no extra cold-scan
 * failure mode). "No internal txs" (status 0) is a normal empty wallet.
 */
async function fetchInternalSignals(
  address: string,
  signal: AbortSignal | undefined,
  opts: ClientOptions,
): Promise<{ inboundBridge: boolean; internalOutTo: string[] }> {
  try {
    const env = await getEnvelope<EsInternalTx[] | string>(
      buildTxlistInternalUrl(address, opts),
      signal,
    );
    // Accept the result whenever it's an array, regardless of status. Blockscout-
    // compat returns status "2" ("Some internal transactions ... not yet been
    // processed") with a fully populated array — verified 2026-06-06 on Soufian's
    // wallet (the Across fills are present there). Keying on status "1" only would
    // discard those rows and re-introduce the false negative this fix removes.
    const rows = toInternalRows(Array.isArray(env.result) ? env.result : []);
    return {
      inboundBridge: detectInboundBridge(rows, address),
      internalOutTo: collectInternalOutTo(rows, address),
    };
  } catch {
    return { inboundBridge: false, internalOutTo: [] };
  }
}

/**
 * Token-transfer signals (FIX D): native-USDC receipt + NFT mint (ERC-721/1155
 * transfer from 0x0). NEVER-FAIL: any error returns false signals.
 *
 * Two sources, picked by opts.tokenSignalsViaV2:
 *  - Etherscan native: tokentx (ERC-20) for USDC + tokennfttx (ERC-721) for mints,
 *    run in parallel (ERC-1155 mints are out of scope on this path — documented).
 *  - Blockscout v2 (compat path): one /token-transfers page (mixed ERC-20/721/1155).
 */
async function fetchTokenSignals(
  address: string,
  signal: AbortSignal | undefined,
  opts: ClientOptions,
): Promise<{ receivedUsdc: boolean; mintedNft: boolean }> {
  if (opts.tokenSignalsViaV2) {
    return fetchTokenSignalsViaV2(address, signal);
  }
  try {
    const [erc20, nft] = await Promise.all([
      getEnvelope<EsTokenTx[] | string>(buildTokenTxUrl(address, "tokentx", opts), signal),
      getEnvelope<EsTokenTx[] | string>(buildTokenTxUrl(address, "tokennfttx", opts), signal),
    ]);
    const erc20Rows = toTokenRows(erc20.result, "ERC-20");
    const nftRows = toTokenRows(nft.result, "ERC-721");
    return {
      receivedUsdc: detectReceivedUsdc(erc20Rows, address),
      mintedNft: detectMintedNft(nftRows, address),
    };
  } catch {
    return { receivedUsdc: false, mintedNft: false };
  }
}

/** Adapt an Etherscan token-tx result (any-array tolerant) to TokenTransferRow. */
function toTokenRows(result: EsTokenTx[] | string, type: string): TokenTransferRow[] {
  const items = Array.isArray(result) ? result : [];
  return items.map((it) => ({
    from: it.from ?? null,
    to: it.to ?? null,
    token: it.contractAddress ?? null,
    type,
  }));
}

/**
 * Blockscout v2 token-transfer item (mixed standards), for the compat path.
 * The token standard is on `token.type` (the item-level `type` is the transfer
 * kind "token_minting"/"token_transfer"). Verified live 2026-06-06.
 */
interface V2TokenTransfer {
  from: { hash?: string } | null;
  to: { hash?: string } | null;
  token: { address_hash?: string; address?: string; type?: string } | null;
}

/**
 * Token signals via the Blockscout v2 /token-transfers endpoint (compat path). One
 * unfiltered page mixes ERC-20/721/1155, so a single call surfaces both signals.
 * NEVER-FAIL.
 */
async function fetchTokenSignalsViaV2(
  address: string,
  signal: AbortSignal | undefined,
): Promise<{ receivedUsdc: boolean; mintedNft: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(`${BLOCKSCOUT_V2_URL}/addresses/${address}/token-transfers`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return { receivedUsdc: false, mintedNft: false };
    const body = (await res.json()) as { items?: V2TokenTransfer[] };
    const rows: TokenTransferRow[] = (body.items ?? []).map((it) => ({
      from: it.from?.hash ?? null,
      to: it.to?.hash ?? null,
      token: it.token?.address_hash ?? it.token?.address ?? null,
      type: it.token?.type ?? null, // token standard, NOT the item-level transfer kind
    }));
    return {
      receivedUsdc: detectReceivedUsdc(rows, address),
      mintedNft: detectMintedNft(rows, address),
    };
  } catch {
    return { receivedUsdc: false, mintedNft: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Token-transfer list URL (Etherscan `module=account&action=tokentx|tokennfttx`). */
function buildTokenTxUrl(
  address: string,
  action: "tokentx" | "tokennfttx",
  opts: ClientOptions,
): string {
  const u = new URL(opts.baseUrl ?? BASE_URL);
  u.searchParams.set("chainid", String(chainId()));
  u.searchParams.set("module", "account");
  u.searchParams.set("action", action);
  u.searchParams.set("address", address);
  u.searchParams.set("startblock", "0");
  u.searchParams.set("endblock", "99999999");
  u.searchParams.set("page", "1");
  u.searchParams.set("offset", String(ETHERSCAN_PAGE_CAP));
  u.searchParams.set("sort", "desc");
  if (opts.requireApiKey !== false) u.searchParams.set("apikey", apiKey());
  return u.toString();
}

/**
 * eth_getCode via a direct JSON-RPC POST to the public Base RPC. Used by the keyless
 * Blockscout-compat path, whose Etherscan-compat host rejects `module=proxy`.
 * Honors the caller's AbortSignal and the same request timeout; on any transport
 * failure it returns "" (treated as EOA) so a flaky RPC never fails the whole scan.
 */
async function fetchCodeViaRpc(
  address: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [address, "latest"],
        id: 1,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    const body = (await res.json()) as { result?: string };
    return typeof body.result === "string" ? body.result : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Live ETH balance (wei, decimal string) via eth_getBalance on the public Base
 * RPC. Never-fail like {@link fetchCodeViaRpc}: any transport/parse failure (or a
 * non-hex result) returns null so a flaky RPC never breaks a scan — the caller
 * then skips the balance-dependent dust malus (scoring.ts §4.3). Exported for the
 * v2 score enrichment in score-address.ts.
 */
export async function fetchBalanceViaRpc(
  address: string,
  signal: AbortSignal | undefined,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string };
    if (typeof body.result !== "string" || !body.result.startsWith("0x")) {
      return null;
    }
    return BigInt(body.result).toString();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Is the scanned address itself a contract? Uses eth_getCode — via the Etherscan
 * proxy module by default, or a direct Base JSON-RPC POST when `getCodeViaRpc` is
 * set (the keyless compat path). Empty code ("0x") = EOA. eth_getCode envelopes
 * carry the bytecode directly in `result` (no status "1").
 */
async function fetchIsContract(
  address: string,
  signal: AbortSignal | undefined,
  opts: ClientOptions,
): Promise<boolean> {
  let code: string;
  if (opts.getCodeViaRpc) {
    code = await fetchCodeViaRpc(address, signal);
  } else {
    const env = await getEnvelope<string>(buildGetCodeUrl(address, opts), signal);
    code = typeof env.result === "string" ? env.result : "";
  }
  return code !== "" && code !== "0x";
}

/**
 * Fetch and aggregate everything scoring/quests need, via Etherscan v2.
 * Shape-identical to blockscout.fetchWalletData.
 *
 * `opts` lets the caller retarget the same client at another Etherscan-compatible
 * host (e.g. keyless Blockscout-compat — see fetchWalletDataViaBlockscoutCompat).
 * @throws EtherscanError on invalid address, missing key, API error, timeout, abort.
 */
export async function fetchWalletData(
  address: string,
  signal?: AbortSignal,
  opts: ClientOptions = {},
): Promise<WalletData> {
  if (!isAddress(address)) {
    throw new EtherscanError(`Invalid address: ${address}`, "invalid_address");
  }
  // Fail fast (and let the caller fall back) when a key is required but absent.
  if (opts.requireApiKey !== false) apiKey();

  const addr = address.toLowerCase();

  // Parallel: tx list (heavy), code check (light), internal-tx pass (bridge +
  // outgoing targets) and token-transfer pass (USDC receipt, NFT mint), both
  // never-fail. Extra round-trips run concurrently; respects the cold-scan budget.
  const [txs, isContract, internalSignals, tokenSignals] = await Promise.all([
    fetchTxs(addr, signal, opts),
    fetchIsContract(addr, signal, opts),
    fetchInternalSignals(addr, signal, opts),
    fetchTokenSignals(addr, signal, opts),
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
    inboundBridge: internalSignals.inboundBridge,
    internalOutTo: internalSignals.internalOutTo,
    receivedUsdc: tokenSignals.receivedUsdc,
    mintedNft: tokenSignals.mintedNft,
    // Basename ownership is resolved at the route level (quest-derived in v1).
    hasBasename: false,
  };
}

/**
 * Same client, pointed at keyless Blockscout-compat (Base). Fast single-call path
 * tried between official Etherscan and the v2 cursor fallback (see score-address.ts).
 * No API key is sent or required. Errors still surface as EtherscanError so the
 * caller can fall back to the v2 cursor client.
 */
export function fetchWalletDataViaBlockscoutCompat(
  address: string,
  signal?: AbortSignal,
): Promise<WalletData> {
  return fetchWalletData(address, signal, {
    baseUrl: BLOCKSCOUT_COMPAT_URL,
    requireApiKey: false,
    // Blockscout-compat rejects module=proxy&action=eth_getCode; use Base RPC.
    getCodeViaRpc: true,
    // Blockscout-compat rejects tokentx/tokennfttx; use the v2 token-transfers endpoint.
    tokenSignalsViaV2: true,
  });
}

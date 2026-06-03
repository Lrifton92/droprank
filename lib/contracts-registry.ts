/**
 * Known contract addresses on Base mainnet (chainId 8453), used by the quest engine.
 *
 * Every address was VERIFIED via the canonical Base explorer
 * (https://base.blockscout.com/api/v2/addresses/<addr>) on 2026-06-03 — the
 * "name"/"implementations" reported by Blockscout is quoted next to each entry.
 * Do NOT invent or edit these without re-verifying on-chain.
 *
 * All addresses are stored lowercase for cheap comparison.
 */

const lc = (a: string) => a.toLowerCase();

/** Aerodrome Router. Blockscout: name "Router", verified. */
export const AERODROME_ROUTER = lc("0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43");

/**
 * Uniswap Universal Router on Base. Two deployments are in active use; we match
 * either so a swap at any point counts.
 * Source: github.com/Uniswap/universal-router deploy-addresses/base.json.
 * Blockscout: both name "UniversalRouter", verified.
 */
export const UNISWAP_UNIVERSAL_ROUTER_V1_2 = lc(
  "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
);
export const UNISWAP_UNIVERSAL_ROUTER_V2 = lc(
  "0x6ff5693b99212da76ad316178a184ab56d299b43",
);

/**
 * Moonwell. Lend/borrow flows interact with the Comptroller (Unitroller proxy)
 * and the individual mTokens. We match the Comptroller plus the two core mTokens.
 * Source: Moonwell on Base. Blockscout: Unitroller(impl Comptroller),
 * MErc20Delegator(impl MWethDelegate / MErc20Delegate), all verified.
 */
export const MOONWELL_COMPTROLLER = lc("0xfBb21d0380beE3312B33c4353c8936a0F13EF26C");
export const MOONWELL_MWETH = lc("0x628ff693426583D9a7FB391E54366292F509D457");
export const MOONWELL_MUSDC = lc("0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22");

/**
 * Aave v3 Pool on Base. Source: bgd-labs/aave-address-book AaveV3Base.POOL.
 * Blockscout: proxy impl "L2PoolInstance", verified.
 */
export const AAVE_V3_POOL = lc("0xA238Dd80C259a72e81d7e4664a9801593F98d1c5");

/**
 * Basenames registrar controllers. Source: base/web usernames addresses.
 * Blockscout: "EARegistrarController" and proxy impl
 * "UpgradeableRegistrarController", both verified. A tx to either = a Basename
 * registration. (The scoring "owns a Basename" check is a reverse resolution,
 * done separately in the data layer.)
 */
export const BASENAMES_EA_CONTROLLER = lc("0xd3e6775Ed9B7dC12B205C8E608Dc3767B9e5eFdA");
export const BASENAMES_UPGRADEABLE_CONTROLLER = lc(
  "0xa7d2607c6BD39Ae9521e514026CBB078405Ab322",
);

/**
 * Canonical OP-stack L2 Standard Bridge on Base.
 * Blockscout: proxy impl "L2StandardBridge", verified.
 * NOTE on detection: a canonical DEPOSIT (bridging FROM Ethereum TO Base) is
 * initiated on L1 and arrives on Base as a system tx — it is NOT a normal tx the
 * user signed on Base, so it does not appear in the user's L2 tx list. What we
 * can reliably detect from the L2 tx list is interaction WITH this bridge
 * (e.g. initiating a withdrawal). The bridge quest therefore matches L2 bridge
 * interactions; pure deposit-only users are a known false-negative (documented).
 */
export const L2_STANDARD_BRIDGE = lc("0x4200000000000000000000000000000000000010");

/**
 * Coinbase Smart Wallet factory. Source: coinbase/smart-wallet README.
 * Blockscout: "CoinbaseSmartWalletFactory" (impl CoinbaseSmartWallet), verified.
 */
export const COINBASE_SMART_WALLET_FACTORY_V1_1 = lc(
  "0xBA5ED110eFDBa3D005bfC882d75358ACBbB85842",
);
export const COINBASE_SMART_WALLET_FACTORY_V1 = lc(
  "0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a",
);

/**
 * Native USDC on Base (Circle). Blockscout: "USDC" (impl FiatTokenV2_2), verified.
 */
export const USDC_NATIVE = lc("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");

/* ------------------------------------------------------------------ *
 * Radar v2 — additional Base protocols.
 * All verified via Blockscout on 2026-06-04 (reported name quoted).
 * Selected from the live DeFiLlama Base TVL ranking (api.llama.fi/protocols)
 * to broaden farming coverage with high-TVL or new-category interactions.
 * ------------------------------------------------------------------ */

/**
 * Morpho Blue singleton (lending, #1 Base TVL ~2.5B). The whole protocol routes
 * through this one immutable contract (supply/borrow/etc.).
 * Source: morpho.org docs / morpho-org/morpho-blue.
 * Blockscout: name "Morpho", verified.
 */
export const MORPHO_BLUE = lc("0xBBBBBbbBBb9cC5e90e3b3Af64bDAF62C37EEFFCb");

/**
 * Compound III (Comet) — USDC market on Base (lending).
 * Source: compound.finance docs / compound-finance/comet.
 * Blockscout: proxy impl "CometWithExtendedAssetList", verified.
 */
export const COMPOUND_V3_USDC = lc("0xb125E6687d4313864e53df431d5425969c15Eb2F");

/**
 * Pendle Router V4 on Base (yield / PT-YT trading). Single entry router.
 * Source: pendle docs (cross-chain canonical router).
 * Blockscout: name "PendleRouterV4", verified.
 */
export const PENDLE_ROUTER_V4 = lc("0x888888888889758F76e7103c6CbF23ABbF58F946");

/**
 * Avantis Trading proxy on Base (perps / derivatives — new category).
 * Source: avantisfi docs.
 * Blockscout: proxy impl "Trading", verified.
 */
export const AVANTIS_TRADING = lc("0x5FF292d70bA9cD9e7CCb313782811b3D7120535f");

/**
 * Extra Finance LendingPool on Base (leveraged yield farming).
 * Source: extrafi docs.
 * Blockscout: name "LendingPool", verified.
 */
export const EXTRA_FINANCE_LENDING_POOL = lc("0xBB505c54D71E9e599cB8435b4F0cEEc05fC71cbD");

/**
 * PancakeSwap SmartRouter on Base (DEX). Single swap entry router.
 * Source: pancakeswap docs (smart-router deployments).
 * Blockscout: name "SmartRouter", verified.
 */
export const PANCAKESWAP_SMART_ROUTER = lc("0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86");

/**
 * OpenSea Seaport 1.6 (NFT marketplace — new category). Same canonical address
 * across chains; a trade/list fulfilment goes through it.
 * Source: opensea / ProjectOpenSea/seaport deployments.
 * Blockscout: name "Seaport", verified.
 */
export const SEAPORT_1_6 = lc("0x0000000000000068F116a894984e2DB1123eB395");

/** Convenience sets for matching `tx.to`. */
export const UNISWAP_ROUTERS = new Set([
  UNISWAP_UNIVERSAL_ROUTER_V1_2,
  UNISWAP_UNIVERSAL_ROUTER_V2,
]);
export const MOONWELL_CONTRACTS = new Set([
  MOONWELL_COMPTROLLER,
  MOONWELL_MWETH,
  MOONWELL_MUSDC,
]);
export const BASENAMES_CONTROLLERS = new Set([
  BASENAMES_EA_CONTROLLER,
  BASENAMES_UPGRADEABLE_CONTROLLER,
]);

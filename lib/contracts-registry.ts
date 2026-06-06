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
 * Uniswap Universal Router on Base. Several deployments are in active use; we
 * match any so a swap at any point counts.
 * Source: github.com/Uniswap/universal-router deploy-addresses/base.json.
 * Blockscout (verified 2026-06-06): all three name "UniversalRouter", verified.
 * V3 (0x6df1…) is the current entry — confirmed used ×9 by the test wallet.
 */
export const UNISWAP_UNIVERSAL_ROUTER_V1_2 = lc(
  "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
);
export const UNISWAP_UNIVERSAL_ROUTER_V2 = lc(
  "0x6ff5693b99212da76ad316178a184ab56d299b43",
);
export const UNISWAP_UNIVERSAL_ROUTER_V3 = lc(
  "0x6df1c91424f79e40e33b1a48f0687b666be71075",
);
/**
 * Uniswap SwapRouter02 on Base (the classic v3 router still hit directly by some
 * integrations). Blockscout (verified 2026-06-06): name "SwapRouter02", verified.
 */
export const UNISWAP_SWAP_ROUTER_02 = lc(
  "0x2626664c2603336E57B271c5C0b26F421741e481",
);

/**
 * Moonwell. Lend/borrow flows interact with the Comptroller (Unitroller proxy)
 * and the individual mTokens. We match the Comptroller plus the core mTokens.
 * Source: Moonwell on Base. Blockscout: Unitroller(impl Comptroller),
 * MErc20Delegator(impl MWethDelegate / MErc20Delegate), all verified.
 * mToken symbols confirmed via Blockscout token info 2026-06-06.
 */
export const MOONWELL_COMPTROLLER = lc("0xfBb21d0380beE3312B33c4353c8936a0F13EF26C");
export const MOONWELL_MWETH = lc("0x628ff693426583D9a7FB391E54366292F509D457");
export const MOONWELL_MUSDC = lc("0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22");
/** Moonwell mcbETH. Blockscout token: symbol "mcbETH" / "Moonwell cbETH". */
export const MOONWELL_MCBETH = lc("0x3bf93770f2d4a794c3d9EBEfBAeBAE2a8f09A5E5");
/** Moonwell mDAI. Blockscout token: symbol "mDAI" / "Moonwell DAI". */
export const MOONWELL_MDAI = lc("0x73b06D8d18De422E269645eaCe15400DE7462417");
/** Moonwell mEURC. Blockscout token: symbol "mEURC" / "Moonwell EURC". */
export const MOONWELL_MEURC = lc("0xb682c840B5F4FC58B20769E691A6fa1305A501a2");

/**
 * Aave v3 Pool on Base. Source: bgd-labs/aave-address-book AaveV3Base.POOL.
 * Blockscout: proxy impl "L2PoolInstance", verified.
 */
export const AAVE_V3_POOL = lc("0xA238Dd80C259a72e81d7e4664a9801593F98d1c5");
/**
 * Aave v3 WrappedTokenGateway on Base — used to SUPPLY native ETH (wraps to
 * WETH then deposits), so an ETH supply never touches AAVE_V3_POOL directly.
 * Source: bgd-labs/aave-address-book AaveV3Base.WETH_GATEWAY.
 * Blockscout (verified 2026-06-06): name "WrappedTokenGatewayV3", verified.
 */
export const AAVE_V3_WETH_GATEWAY = lc("0x8be473dCfA93132658821E67CbEB684ec8Ea2E74");

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
 * Detection: an L2 interaction with this contract appears in the normal tx list
 * (e.g. initiating a withdrawal). A canonical DEPOSIT (bridging FROM Ethereum TO
 * Base) is finalized on L2 by this same bridge crediting the user via an INTERNAL
 * tx (from = L2StandardBridge, value > 0) — invisible in the normal list but
 * caught by the internal-tx pass (see BRIDGE_CONTRACTS / bridge-canonical quest).
 */
export const L2_STANDARD_BRIDGE = lc("0x4200000000000000000000000000000000000010");

/**
 * Across Protocol SpokePool on Base (third-party bridge). An inbound fill
 * (bridging onto Base via Across) is delivered to the user as an INTERNAL tx
 * (from = SpokePool, value > 0) — never a normal tx the user signed on Base.
 * Verified on base.blockscout.com 2026-06-06: proxy impl "OP_SpokePool", verified.
 * Source: across.to docs / across-protocol/contracts (Base SpokePool).
 */
export const ACROSS_SPOKE_POOL = lc("0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64");

/**
 * Socket / Bungee SocketGateway (third-party bridge aggregator). Same canonical
 * address across chains. Bridging through it is a normal tx with `to` = this
 * gateway (and it never touches the canonical L2 bridge).
 * Verified on base.blockscout.com 2026-06-06: name "SocketGateway", verified.
 * Source: socket.tech / SocketDotTech (SocketGateway).
 */
export const SOCKET_GATEWAY = lc("0x3a23F943181408EAC424116Af7b7790c94Cb97a5");

/**
 * Bridges we recognize for the bridge quest / score criterion. Matched two ways:
 *  - a NORMAL tx whose `to` is one of these (e.g. L2 bridge withdrawal, Socket
 *    aggregator bridge);
 *  - an INBOUND INTERNAL tx whose `from` is one of these with value > 0 (canonical
 *    deposit finalization, Across fill) — the data layer surfaces this signal.
 */
export const BRIDGE_CONTRACTS = new Set([
  L2_STANDARD_BRIDGE,
  ACROSS_SPOKE_POOL,
  SOCKET_GATEWAY,
]);

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
 * Compound III (Comet) markets on Base (lending). Each collateral base asset is a
 * separate Comet contract; we match any so a supply to any market counts.
 * Source: compound.finance docs / compound-finance/comet.
 * Blockscout (verified 2026-06-06): all proxy impl "CometWithExtendedAssetList",
 * token symbols cUSDCv3 / cWETHv3 / cAEROv3 / cUSDbCv3.
 */
export const COMPOUND_V3_USDC = lc("0xb125E6687d4313864e53df431d5425969c15Eb2F");
export const COMPOUND_V3_WETH = lc("0x46e6b214b524310239732D51387075E0e70970bf");
export const COMPOUND_V3_AERO = lc("0x784efeB622244d2348d4F2522f8860B96fbEcE89");
export const COMPOUND_V3_USDBC = lc("0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf");

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
 * Extra Finance on Base (leveraged yield farming). The LendingPool handles plain
 * deposits; the VeloPositionManager opens/manages the leveraged farming positions.
 * Source: extrafi docs.
 * Blockscout (verified 2026-06-06): "LendingPool" and "VeloPositionManager", verified.
 */
export const EXTRA_FINANCE_LENDING_POOL = lc("0xBB505c54D71E9e599cB8435b4F0cEEc05fC71cbD");
export const EXTRA_FINANCE_POSITION_MANAGER = lc("0xf9cFB8a62f50e10AdDE5Aa888B44cF01C5957055");

/**
 * PancakeSwap on Base (DEX). Swaps route through the SmartRouter (aggregated v2/v3/
 * stable) or the classic v3 SwapRouter hit directly by some integrations; match either.
 * Source: pancakeswap docs (smart-router / v3 deployments).
 * Blockscout (verified 2026-06-06): "SmartRouter" and "SwapRouter", verified.
 */
export const PANCAKESWAP_SMART_ROUTER = lc("0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86");
export const PANCAKESWAP_V3_SWAP_ROUTER = lc("0x1b81D678ffb9C0263b24A97847620C99d213eB14");

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
  UNISWAP_UNIVERSAL_ROUTER_V3,
  UNISWAP_SWAP_ROUTER_02,
]);
export const MOONWELL_CONTRACTS = new Set([
  MOONWELL_COMPTROLLER,
  MOONWELL_MWETH,
  MOONWELL_MUSDC,
  MOONWELL_MCBETH,
  MOONWELL_MDAI,
  MOONWELL_MEURC,
]);
export const AAVE_CONTRACTS = new Set([AAVE_V3_POOL, AAVE_V3_WETH_GATEWAY]);
export const COMPOUND_CONTRACTS = new Set([
  COMPOUND_V3_USDC,
  COMPOUND_V3_WETH,
  COMPOUND_V3_AERO,
  COMPOUND_V3_USDBC,
]);
export const PANCAKESWAP_ROUTERS = new Set([
  PANCAKESWAP_SMART_ROUTER,
  PANCAKESWAP_V3_SWAP_ROUTER,
]);
export const EXTRA_FINANCE_CONTRACTS = new Set([
  EXTRA_FINANCE_LENDING_POOL,
  EXTRA_FINANCE_POSITION_MANAGER,
]);
export const BASENAMES_CONTROLLERS = new Set([
  BASENAMES_EA_CONTROLLER,
  BASENAMES_UPGRADEABLE_CONTROLLER,
]);

/**
 * Talent Protocol on Base — powers the Builder Score behind Base Builder Rewards.
 * Verified on base.blockscout.com 2026-06-04:
 *  - PassportRegistry: name "PassportRegistry", verified (create a Talent profile).
 *  - PassportBuilderScore: name "PassportBuilderScore", verified (score onchain).
 */
export const TALENT_PASSPORT_REGISTRY = lc("0xb477A9BD2547ad61f4Ac22113172Dd909E5B2331");
export const TALENT_BUILDER_SCORE = lc("0xBBFeDA7c4d8d9Df752542b03CdD715F790B32D0B");
export const TALENT_CONTRACTS = new Set([
  TALENT_PASSPORT_REGISTRY,
  TALENT_BUILDER_SCORE,
]);

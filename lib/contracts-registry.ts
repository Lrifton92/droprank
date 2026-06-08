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

/** Aerodrome Router (classic Solidly v2 router). Blockscout: name "Router", verified. */
export const AERODROME_ROUTER = lc("0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43");

/**
 * Aerodrome Universal Router(s) — the aggregated swap entrypoint the
 * aerodrome.finance UI dispatches to (routes both v2 and Slipstream/CL pools).
 * A swap done on Aerodrome today has `to` = one of these, NOT the classic Router
 * above — so the swap-aerodrome quest missed real swaps (reported gap, fixed
 * 2026-06-09 from a live reproduction).
 *  - 0xcAF2…7c67 (current): Blockscout name "UniversalRouter", verified; its
 *    constructor carries veloV2Factory / veloCLFactory params (Velodrome/Aerodrome
 *    lineage) — confirmed live as the router an aerodrome.finance swap routes through.
 *  - 0x6cb4…Be3e (prior): Blockscout name "UniversalRouter", verified; BaseScan
 *    public label "Aerodrome: Universal Router".
 */
export const AERODROME_UNIVERSAL_ROUTER = lc("0xcAF22ce31298CF2BF1D152862F80216478ad7c67");
export const AERODROME_UNIVERSAL_ROUTER_LEGACY = lc(
  "0x6cb442acF35158D5eDa88fe602221b67B400Be3E",
);

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
 * Uniswap Universal Router 2.1.1 — the v4-supporting Universal Router that
 * app.uniswap.org routes Base swaps through today (post-v4). A swap done on the
 * official UI now has `to` = this, not the older v1.2/v2/v3 routers above (audit
 * gap, 2026-06-09). Blockscout: name "UniversalRouter", verified. Source: official
 * Uniswap v4 deployments page (developers.uniswap.org, Base 8453).
 */
export const UNISWAP_UNIVERSAL_ROUTER_V4 = lc(
  "0xfdf682f51fe81aa4898f0ae2163d8a55c127fbc7",
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
 * Moonwell WETHRouter — a native-ETH lend on app.moonwell.fi routes through this
 * router (not an mToken directly), so an ETH supply has `to` = this (audit gap,
 * 2026-06-09). Blockscout: name "WETHRouter", verified. Source: docs.moonwell.fi.
 */
export const MOONWELL_WETH_ROUTER = lc("0x70778cfcFC475c7eA0f24cC625Baf6Eae475D0c9");
/**
 * Additional Moonwell core markets on Base (the registry previously covered only 6
 * of ~18). Each is an MErc20Delegator (impl MErc20Delegate), verified on Blockscout
 * 2026-06-09; symbols per docs.moonwell.fi. A lend into any of these has `to` = the
 * mToken and was undetected.
 */
export const MOONWELL_MUSDBC = lc("0x703843C3379b52F9FF486c9f5892218d2a065cC8");
export const MOONWELL_MWSTETH = lc("0x627Fe393Bc6EdDA28e99AE648fD6fF362514304b");
export const MOONWELL_MRETH = lc("0xCB1DaCd30638ae38F2B94eA64F066045B7D45f44");
export const MOONWELL_MWEETH = lc("0xb8051464C8c92209C92F3a4CD9C73746C4c3CFb3");
export const MOONWELL_MAERO = lc("0x73902f619CEB9B31FD8EFecf435CbDf89E369Ba6");
export const MOONWELL_MCBBTC = lc("0xF877ACaFA28c19b96727966690b2f44d35aD5976");
export const MOONWELL_MWRSETH = lc("0xfC41B49d064Ac646015b459C522820DB9472F4B5");
export const MOONWELL_MTBTC = lc("0x9A858ebfF1bEb0D3495BB0e2897c1528eD84A218");
export const MOONWELL_MLBTC = lc("0x10fF57877b79e9bD949B3815220ec87B9fc5D2ee");
export const MOONWELL_MVIRTUAL = lc("0xdE8Df9d942D78edE3Ca06e60712582F79CfffC64");
export const MOONWELL_MWELL = lc("0xdc7810B47eAab250De623F0Ee07764afa5F71eD1");
export const MOONWELL_MUSDS = lc("0xb6419c6C2e60c4025D6D06eE4F913ce89425a357");

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
 * Current Aave v3 WrappedTokenGatewayV3 on Base — the gateway app.aave.com uses
 * for native-ETH supplies today (the 0x8be4… above is the older "2.0" gateway;
 * both still see traffic). An ETH supply now has `to` = this (audit gap,
 * 2026-06-09). Blockscout: name "WrappedTokenGatewayV3", verified. Source:
 * bgd-labs/aave-address-book AaveV3Base.WETH_GATEWAY.
 */
export const AAVE_V3_WETH_GATEWAY_V3 = lc("0xa0d9c1e9e48ca30c8d8c3b5d69ff5dc1f6dffc24");

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
 * Legacy public Basenames RegistrarController — the public registration entrypoint
 * from mid-2024 until the Upgradeable controller migration. A large cohort of
 * existing Basename holders registered through it (still receives `register` calls),
 * and they were undetected (audit gap, 2026-06-09). Blockscout: name
 * "RegistrarController", verified. Source: base/basenames README (Original/Legacy).
 */
export const BASENAMES_LEGACY_CONTROLLER = lc(
  "0x4cCb0BB02FCABA27e82a56646E81d8c5bC4119a5",
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
 * Morpho Bundler3 — the multicall entrypoint the app.morpho.org UI routes
 * supply/deposit/borrow through. A deposit done on Morpho today has `to` = this
 * bundler (which calls Morpho Blue / a MetaMorpho vault internally), NOT the
 * Morpho Blue singleton above — so the lend-morpho quest missed real deposits
 * (the reported gap, fixed 2026-06-09 from a live reproduction).
 * Blockscout: name "Bundler3", verified; source references Morpho.
 * Source: morpho-org/bundler3.
 */
export const MORPHO_BUNDLER3 = lc("0x6BFd8137e702540E7A42B74178A4a49Ba43920C4");

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
 * Compound III BaseBulker on Base — the single shared bulker app.compound.finance
 * routes ETH supplies and batched actions through (instead of the Comet directly),
 * so those supplies have `to` = this (audit gap, 2026-06-09). Blockscout: name
 * "BaseBulker", verified. Source: compound-finance/comet deployments/base roots.json.
 */
export const COMPOUND_V3_BULKER = lc("0x78d0677032A35c63D142a48A2037048871212a8C");

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
 * PancakeSwap Universal Router on Base — the aggregated entrypoint the current
 * pancakeswap.finance UI routes swaps through (so a swap done today has `to` =
 * this, not the SmartRouter/V3 router above; the reported gap, fixed 2026-06-09).
 * Same canonical address across chains (CREATE2). Blockscout: name
 * "UniversalRouter", verified; source references PancakeSwap/stableSwap.
 * BaseScan public label "PancakeSwap: Universal Router"; listed in PancakeSwap
 * developer docs (universal-router/addresses) for Base.
 */
export const PANCAKESWAP_UNIVERSAL_ROUTER = lc(
  "0xFE6508f0015C778Bdcc1fB5465bA5ebE224C9912",
);

/**
 * OpenSea Seaport 1.6 (NFT marketplace — new category). Same canonical address
 * across chains; a trade/list fulfilment goes through it.
 * Source: opensea / ProjectOpenSea/seaport deployments.
 * Blockscout: name "Seaport", verified.
 */
export const SEAPORT_1_6 = lc("0x0000000000000068F116a894984e2DB1123eB395");

/** Convenience sets for matching `tx.to`. */
export const AERODROME_ROUTERS = new Set([
  AERODROME_ROUTER,
  AERODROME_UNIVERSAL_ROUTER,
  AERODROME_UNIVERSAL_ROUTER_LEGACY,
]);
export const UNISWAP_ROUTERS = new Set([
  UNISWAP_UNIVERSAL_ROUTER_V1_2,
  UNISWAP_UNIVERSAL_ROUTER_V2,
  UNISWAP_UNIVERSAL_ROUTER_V3,
  UNISWAP_UNIVERSAL_ROUTER_V4,
  UNISWAP_SWAP_ROUTER_02,
]);
export const MOONWELL_CONTRACTS = new Set([
  MOONWELL_COMPTROLLER,
  MOONWELL_WETH_ROUTER,
  MOONWELL_MWETH,
  MOONWELL_MUSDC,
  MOONWELL_MCBETH,
  MOONWELL_MDAI,
  MOONWELL_MEURC,
  MOONWELL_MUSDBC,
  MOONWELL_MWSTETH,
  MOONWELL_MRETH,
  MOONWELL_MWEETH,
  MOONWELL_MAERO,
  MOONWELL_MCBBTC,
  MOONWELL_MWRSETH,
  MOONWELL_MTBTC,
  MOONWELL_MLBTC,
  MOONWELL_MVIRTUAL,
  MOONWELL_MWELL,
  MOONWELL_MUSDS,
]);
export const AAVE_CONTRACTS = new Set([
  AAVE_V3_POOL,
  AAVE_V3_WETH_GATEWAY,
  AAVE_V3_WETH_GATEWAY_V3,
]);
export const COMPOUND_CONTRACTS = new Set([
  COMPOUND_V3_USDC,
  COMPOUND_V3_WETH,
  COMPOUND_V3_AERO,
  COMPOUND_V3_USDBC,
  COMPOUND_V3_BULKER,
]);
export const MORPHO_CONTRACTS = new Set([MORPHO_BLUE, MORPHO_BUNDLER3]);
export const PANCAKESWAP_ROUTERS = new Set([
  PANCAKESWAP_SMART_ROUTER,
  PANCAKESWAP_V3_SWAP_ROUTER,
  PANCAKESWAP_UNIVERSAL_ROUTER,
]);
export const EXTRA_FINANCE_CONTRACTS = new Set([
  EXTRA_FINANCE_LENDING_POOL,
  EXTRA_FINANCE_POSITION_MANAGER,
]);
export const BASENAMES_CONTROLLERS = new Set([
  BASENAMES_EA_CONTROLLER,
  BASENAMES_UPGRADEABLE_CONTROLLER,
  BASENAMES_LEGACY_CONTROLLER,
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

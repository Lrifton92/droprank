# Changelog

Building in the open — dated entries, newest first.

## 2026-06-06

- Menu micro-polish: session boot animation, info ticker, SVG card arrows
  (chevron at rest, shaft draws in on hover), mirrored back-button arrow.
- Score page: mint button hoisted into the hero, centered under the tier badge.

## 2026-06-05

- **Wallet Score v2** — 10 criteria sourced from real airdrop snapshots
  (ARB / OP / ZK / LayerZero): activity spread (anti-burst), protocol
  diversity, bridging, grouped identity, dust-excluded volume, bounded sybil
  malus (−10, displayed honestly). Percentile via versioned ZSET, 250 tests.
- **YIELD tab** — multi-chain risk-adjusted Yield Score (Base / Ethereum /
  OP / Arbitrum), STABLE / MAJORS / DEGEN profiles, terminal-aligned rows,
  official-site links only, two-level FR/EN disclaimer, daily pre-warm cron.
- ALL-networks mode aggregating the four chain caches, per-row network tag,
  live target badge.
- Radar aligned on Score v2: per-quest category tags, diversity banner,
  "+4 score" bridge badge.
- News: 100% thumbnail coverage (server og:image cache + deterministic
  generated placeholders), four image-rich direct feeds, cross-feed dedup,
  date separators (today / yesterday / calendar weeks / months, localized).
- Site-wide motion: page transitions, ambient grid drift, count-ups, breathing
  halos, banner sweep — full reduced-motion support.
- New brand icon: 3D soulbound badge on Base blue.
- Fix: basename display via CORS-safe mainnet RPC for OnchainKit.

## 2026-06-04

- **DropRankBadge live on Base mainnet** —
  `0x5d3febf136e461be015713e2947bbd0940c8e92b`, verified on Basescan,
  Blockscout and Sourcify.
- Mint flow: real wallet chain switch + 3D confetti celebration on confirmed
  receipt.
- Cold scan 34s → ~1s via keyless Blockscout etherscan-compat (txlist 10k in
  one call) + public Base RPC.
- Etherscan circuit breaker (free tier dropped Base 8453) + shared Upstash L2
  cache, never-fail.
- Fix: L2 cache key collision between score and quests — namespacing now
  mandatory in `getOrSetCached`, with anti-recurrence tests.
- Desktop layouts ≥768px on every page (mobile pixel-identical), 1600px tier.
- News thumbnails from RSS with polished loading (shimmer, fade-in, no-referrer).
- Radar: Base reward programs block (Guild, Builder Rewards, Onchain Summer).
- Farcaster manifest copy made validator-compliant.

## 2026-06-03

- Design spec v1: score + 12-quest radar + soulbound badge, Base mini-app.
- Soulbound ERC-721 `DropRankBadge` with EIP-712 score attestation,
  19 Solidity tests (Hardhat 3, forge-std).
- MiniKit Next.js scaffold, Blockscout provider, scoring + quests + API routes.
- Terminal-style UI: Base blue tokens, JetBrains Mono, 3D CSS cube landing,
  boot HUD entry sequence, dynamic 1200×800 share image via `next/og`.

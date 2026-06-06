# DropRank

**Scan your wallet. Know your airdrop odds. Mint the proof.**

DropRank is a Base mini-app that scores any wallet's airdrop readiness, shows
exactly what to improve, and lets you mint your score as a soulbound badge —
fully on-chain, non-transferable, refreshable.

**Live:** [droprank.xyz](https://droprank.xyz)

## What it does

- **WALLET — Score v2.** 10 criteria sourced from real airdrop snapshots
  (ARB, OP, ZK, LayerZero): activity spread, protocol diversity, bridging,
  grouped identity, dust-excluded volume, bounded sybil malus. Percentile
  ranked against every scanned wallet.
- **RADAR.** 12 actionable quests mapped to the score categories, with a
  diversity tracker and direct links to Base reward programs.
- **NEWS.** Base ecosystem feed — direct publisher RSS, og:image thumbnails,
  weekly/monthly separators, EN/FR.
- **DISCOVER.** Curated Base protocols to explore.
- **YIELD.** Risk-adjusted Yield Score across Base, Ethereum, Optimism and
  Arbitrum — three profiles (STABLE / MAJORS / DEGEN), official-site links
  only, two-level disclaimer.

## On-chain badge

Soulbound ERC-721 on Base mainnet —
[`0x5d3febf136e461be015713e2947bbd0940c8e92b`](https://basescan.org/address/0x5d3febf136e461be015713e2947bbd0940c8e92b).
Score attested off-chain via EIP-712 and rendered as a fully on-chain SVG.
See [`contracts/`](contracts/README.md).

## Stack

Next.js (App Router) · OnchainKit / MiniKit · wagmi + viem · Blockscout +
public Base RPC (keyless scan) · Upstash Redis L2 cache · Solidity 0.8.24
(Hardhat 3, forge-std tests) · Vitest.

## Docs

Specs, scoring methodology and research live in [`docs/`](docs/).

## Develop

```bash
npm install
npm run dev   # http://localhost:3000
npm test
```

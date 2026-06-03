# DropRank — Spec Design (2026-06-03)

## Vision
Mini-app Base (Farcaster/Base App) premium : **le checker de score airdrop + radar de quêtes** que tous les farmers Base utilisent. Soufian = builder au centre du trafic farmer. Chaque visiteur laisse des tx sur notre contrat (badge soulbound).

## Cible & boucle virale
- Farmer colle/connecte son wallet → score /100 + percentile → share card Farcaster/X → viral.
- Radar de quêtes = rétention (revenir compléter, re-checker le score).
- Badge onchain refreshable = tx récurrentes sur NOTRE contrat.

## UX Flow
1. **Landing** : fond sombre, **cube 3D bleu Base qui s'amuse dans son coin** (animation autonome ludique : rebonds, rotations, réactions au hover), titre DropRank, bouton **Connect Wallet** (OnchainKit). Option "paste address" lecture seule.
2. **Connexion validée → séquence d'entrée** : animation boot HUD séquencée (SCANNING WALLET… / BASE LINK ESTABLISHED / ACCESS GRANTED), scanlines, compteurs qui roulent — excitation avant le menu.
3. **Menu** : 2 sections — SCORE / RADAR (+ badge mint CTA).
4. **Score** : score /100 reveal animé, breakdown par critère (style réponse API/terminal), percentile, bouton "Mint/Refresh badge", bouton share (image OG dynamique).
5. **Radar** : ~12 quêtes vérifiées onchain auto (✅/❌), points par quête, lien direct pour faire chaque quête.

## Direction artistique (directives Soufian)
- Bleu Base **#0052FF** dominant sur fond sombre, premium, épuré techno.
- **Futur techno** : micro-copies HUD, reveals séquencés, scanlines subtiles, glow bleu, compteurs tabular-nums.
- **Dev-friendly** : JetBrains Mono pour les données, blocs façon terminal/console, structure type API response, curseur blink, syntax-highlight discret.
- Cube 3D : léger (CSS 3D ou canvas — décision designer, budget perf webview mini-app), clin d'œil au carré bleu Base.
- Minutie : typo features, spacing 4/8, easings précis, focus rings, états hover/active/disabled, tabular-nums.

## Scoring /100
| Critère | Max | Détection |
|---|---|---|
| Nb transactions (paliers) | 20 | Blockscout API tx count |
| Mois actifs distincts | 15 | timestamps tx |
| Jours actifs distincts | 10 | timestamps tx |
| Volume ETH cumulé | 10 | somme value tx |
| Contrats uniques touchés | 10 | to-addresses distinctes (code) |
| Ancienneté 1ère tx | 5 | first tx timestamp |
| Basename possédé | 5 | reverse resolution Basenames |
| Smart Wallet utilisé | 5 | code account / factory Coinbase |
| Quêtes Radar complétées | 20 | moteur quêtes |

Percentile : distribution des wallets déjà checkés (store Upstash/Vercel KV, sorted set). Fallback si store down : distribution statique embarquée (pattern edge-cache fallback).

## Quêtes Radar (v1, ~12)
Swap Aerodrome · Swap Uniswap (Base) · Lend/Borrow Moonwell · Supply Aave v3 Base · Mint NFT (n'importe lequel) · Mint Zora · Basename · Smart Wallet tx · Bridge canonical vers Base · Déployer un contrat · 30 jours actifs distincts · Hold USDC natif.
Détection : liste d'adresses contrats connus + scan des tx via Blockscout (keyless) ; Etherscan v2 en fallback optionnel.

## Architecture
- **Frontend** : Next.js (template `npx create-onchain --mini`, OnchainKit v1, MiniKit enabled, wagmi/viem). App Router.
- **API routes** : `/api/score/[address]` (fetch Blockscout + calcul + cache), `/api/quests/[address]`, `/api/og/[address]` (image share dynamique), `/api/sign-score` (signature EIP-712 du score pour le mint), `/.well-known/farcaster.json` (manifest).
- **Lib pure** : `lib/scoring.ts`, `lib/quests.ts`, `lib/providers/blockscout.ts` — testables unitairement (vitest).
- **Contrat** `contracts/DropRankBadge.sol` (Foundry) : ERC-721 **soulbound** (non transférable), 1/address, `mint(score, sig)` + `refresh(score, sig)`, score signé EIP-712 par backend signer (clé dédiée sans fonds), tokenURI SVG onchain (score + tier + bleu Base). Déploiement Base mainnet, vérifié Basescan.
- **Store** : Upstash Redis (percentiles + cache scores, TTL). Quota géré (memoire KV quota → fallback).
- **Déploiement** : Vercel. Manifest Farcaster signé via `npx create-onchain --manifest` (compte Farcaster Soufian, à la fin).

## Sécurité
- Clé signer backend = env Vercel, ne détient aucun fonds, ne fait que signer des scores.
- Pas de clé privée user manipulée. Lecture seule des wallets.
- Rate-limit API routes (IP) pour protéger quotas providers.
- Audit cybersecurite-senior avant déploiement.

## Phases
1. Scaffold MiniKit + structure + providers. ✅ = app boot local.
2. Data layer + scoring + quests (TDD, vitest verts).
3. Contrat Foundry + tests forge + signature EIP-712.
4. UI premium (landing cube 3D, séquence entrée, score, radar, share OG).
5. Tests E2E + audit secu + fixes.
6. Deploy Vercel + contrat mainnet + manifest Farcaster + enregistrement écosystème Base.

## Dépendances Soufian
- Clé API CDP (NEXT_PUBLIC_ONCHAINKIT_API_KEY) — gratuite, portal.cdp.coinbase.com.
- Wallet déployeur avec ~5$ ETH sur Base (déploiement contrat).
- Signature manifest Farcaster (1 min, à la fin).

## Hors scope v1 (YAGNI)
Multi-chain, comparaison entre wallets arbitraires, historique de score, notifications push, token du jeu, marketplace.

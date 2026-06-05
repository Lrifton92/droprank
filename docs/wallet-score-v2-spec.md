# Wallet Score v2 — Spec (project-informed, sourced)

> Auteur : analyste-quantitatif · Date : 2026-06-05 · Statut : SPEC (pas de code).
> Objet : faire évoluer le score wallet /100 de DropRank de v1 « métriques classiques »
> vers une v2 dont **chaque métrique est justifiée par un critère d'airdrop réellement
> publié**. Rétro-compatible dans l'esprit (mêmes données scannées, même /100, même
> breakdown lisible).
>
> ⚠️ Aucun airdrop Base n'est confirmé (cf. `docs/research/2026-06-04-base-airdrop-state.md`).
> Le score est un **proxy heuristique** de « profil airdrop-friendly », pas une prédiction.
> Disclaimer obligatoire côté UI (déjà présent en v1).

---

## 0. Ce que v1 fait déjà (point de départ)

`lib/scoring.ts` — barème /100, 9 critères, tiers paliers :

| Critère | Max v1 | Donnée |
|---|---|---|
| Transactions | 20 | `txCount` |
| Active months | 15 | `monthKey(timestamp)` distincts |
| Active days | 10 | `dayKey(timestamp)` distincts |
| ETH volume | 10 | Σ `value` (wei→eth) |
| Contracts touched | 10 | `to` distincts où `toIsContract` |
| Wallet age | 5 | now − min(`timestamp`) |
| Basename | 5 | `hasBasename` |
| Smart Wallet | 5 | `usedSmartWallet` |
| Quests | 20 | moteur 19 quêtes (clamp 20) |

**Limite de v1** : les paliers sont une calibration « ronde » non sourcée, et v1 ne
distingue PAS un wallet régulier d'un wallet burst (10k tx en 2 jours = même score que
10k tx sur 18 mois sur tous les critères de comptage). Or **c'est exactement ce que tous
les airdrops majeurs pénalisent**. C'est le trou que v2 comble.

---

## 1. Synthèse des sources (Phase 1) — airdrop → critères documentés

### 1.1 Tableau maître

| Airdrop | Métriques exactes publiées | Seuils / pondérations | Anti-sybil documenté |
|---|---|---|---|
| **Arbitrum ARB** | Système à **points (1 pt/critère)**, min 3 pts éligible. Bridge ; **tx sur N mois distincts** (2 / 6 / 9 = +1 pt chacun) ; **count tx OU contrats** (>4 / >10 / >25 / >100 = +1 pt chacun) ; **volume agrégé** (>$10k / >$50k / >$250k) ; **valeur bridgée** (>$10k / >$50k / >$250k). | Paliers logarithmiques empilés. La **répartition temporelle est un critère de premier ordre** (3 paliers de mois). | **−1 pt si toutes les tx dans une fenêtre de 48 h** ; **−1 pt si balance < 0.005 ETH ET ≤ 1 contrat touché** (dust + mono-contrat). |
| **Optimism OP** | 6 jeux de critères. Multi-sig signer (≥10 tx all-time) ; **vote DAO on-chain (≥1) ou off-chain (≥2)** ; donateur Gitcoin ; « priced out of Ethereum » = a bridgé MAIS continue ≥2 tx/sem sur L1. | **Bonus d'overlap** : matcher ≥4 jeux de critères augmente l'allocation (récompense la **diversité de comportements**, pas le volume brut). | Filtres par cohorte ; seuils minimaux par catégorie pour exclure l'activité triviale. |
| **zkSync ZK** | **Value-scaling** : allocation = f(montant envoyé sur le réseau, **durée de détention**). $100 depuis le mainnet >> $100 déposés juste avant le snapshot. | Multiplicateurs : faible funding → moins de points, mais **boost si comportement on-chain « humain »**. | Heuristiques bot ; choix explicite de **ne pas sur-filtrer** (réduire faux positifs) et plutôt **récompenser le signal organique**. |
| **Starknet STRK** | 6 classes ; **métrique d'activité ET d'usage** par classe ; activité étalée **2022-2023** (longévité). | Allocation relative intra-classe. | Sybil filtering par tiers externe. |
| **LayerZero ZRO** | Min 25 / max 5k ZRO. **Tx < $1 et NFT « sans valeur » dé-pondérés de 50 %.** | Volume réel pondéré. | Clustering Nansen + Chaos Labs ; **fenêtre de self-report** (déclare-toi sybil → 15 % au lieu de 0). ~10M ZRO récupérés. |
| **Hyperliquid HYPE** | Points = engagement réel (**volume cumulé spot+perp**, deposits, tenure du compte, staking). | Plus de volume + ancienneté = plus de points. | **Wash trading + withdrawals + wallets liés = pénalisés/flaggés sybil.** Saisons successives → ne garde que les users **persistants**. |
| **Talent Builder Score** (Base, rewards ACTIFS) | Score 0-100, 3 catégories : **Identity (cap 20)**, **Activity (cap 40)**, Skills. Signaux on-chain : **historique de tx Base**, smart contracts, déploiements, + GitHub/social. Composante = signal strength × multiplier (cap max). | Identity sépare humains/sybils. Activity = contributeurs actifs vs « value capturers ». **20 ETH/sem top 100 builders Base.** | Identity credentials = barrière anti-sybil explicite. |

### 1.2 Ce que Base/Coinbase valorise publiquement (pas un airdrop, mais le *signal* que vise DropRank)
- **Smart Wallet / Base Account** + **transactions gasless (paymaster sponsorisé)** = signal d'adoption de la stack Coinbase.
- **Basenames** (`.base.eth`) = pilier « Secure Identity » du Base App ; attestations EAS `verifications.coinbase.eth` (Verified Account, Country, Coinbase One).
- **Participation organique** (hackathons, Onchain Summer) reconnue via attestations.
- Sources : docs.base.org/smart-wallet, ens.domains/ecosystem/base, docs.cdp.coinbase.com/paymaster.

### 1.3 Patterns transverses qui ressortent (≥2 sources chacun)
1. **Mois distincts >> burst** (Arbitrum 3 paliers de mois + pénalité 48 h ; Starknet longévité ; recherche académique « time-weighted, consistent over months not bursts »).
2. **Volume par paliers logarithmiques**, pas linéaire (Arbitrum, Hyperliquid, LayerZero).
3. **Diversité de comportements / protocoles récompensée** (OP overlap bonus ≥4 critères ; meta Base « diversité de catégories »).
4. **Dust dé-pondéré** (Arbitrum < 0.005 ETH ; LayerZero tx < $1 et NFT sans valeur −50 %).
5. **Longévité / récence** : compte ancien ET encore actif (OP « priced out » = continue après bridge ; Hyperliquid tenure + persistance saison sur saison).
6. **Burst = signal sybil n°1** (Arbitrum 48 h ; académique « activity concentrated in short windows » ; Hyperliquid wash/linked wallets).
7. **Identité on-chain = barrière anti-sybil** (Talent Identity cap 20 ; Base Verifications/Basenames/Smart Wallet).

---

## 2. Contrainte de données (ce que le scan fournit RÉELLEMENT)

Par tx (`lib/types.ts` → `Tx`) : `hash, from, to, value(wei str), timestamp(s), method?, toIsContract?, createsContract?`.
Par wallet (`WalletData`) : `txCount` (réel, peut dépasser `txs.length` si capé 10k), `isContract`, `hasBasename`, `usedSmartWallet`.
Moteur quêtes : détecte ~19 contrats Base vérifiés par catégorie (DEX, Lending, Perps, Identity/Basenames, Bridge, NFT/Seaport, Social/Talent) — voir `lib/contracts-registry.ts`.

**Tout le calcul v2 ci-dessous tient depuis cette donnée déjà scannée.** Pas de nouvel appel
réseau requis pour le cœur de v2.

### Enrichissements API proposés (max 2, gratuits) — OPTIONNELS
| Enrichissement | Source gratuite | Justifie quoi | Verdict |
|---|---|---|---|
| **Solde ETH live du wallet** | `eth_getBalance` via RPC `mainnet.base.org` (déjà utilisé pour `eth_getCode`) | Réplique le filtre dust Arbitrum (« balance < 0.005 ETH ») → composante anti-sybil plus fidèle | **RECOMMANDÉ** : 1 appel RPC, déjà câblé, gratuit, keyless. |
| **Vérif `verified`/`name` d'un contrat `to`** | Blockscout `/api/v2/smart-contracts/{addr}` | Affiner le « ratio organique » (tx vers contrats *vérifiés* vs EOA transfers) au-delà du registre de 19 | **NON RETENU pour v2** : N appels/wallet, coûteux, le registre + `toIsContract` suffit comme proxy. À garder en backlog. |

Décision : v2 ajoute **un seul** enrichissement, le solde ETH (1 appel), pour le filtre dust.
Si l'appel échoue, on dégrade proprement (cf. §4.3) — never-fail comme le reste du data layer.

---

## 3. Métriques v2 retenues (5-8) — chacune sourcée

Principe : **on garde les comptages v1, mais on les pondère par la qualité temporelle et on
ajoute une couche anti-burst + diversité + identité**, exactement comme les airdrops réels.

### M1. Régularité temporelle (mois distincts) — RENFORCÉ, poids ↑
- **Quoi** : nombre de **mois calendaires distincts** avec ≥1 tx (déjà calculé v1 via `monthKey`).
- **Pourquoi** : Arbitrum fait des mois distincts un critère de 1er ordre (paliers 2/6/9), Starknet récompense la longévité 2022-2023.
- **Source** : docs.arbitrum.foundation/airdrop-eligibility-distribution ; starkware.co/airdrop-reflections.
- **Évolution v1→v2** : poids passe de 15 à **18** (c'est le signal le plus prédictif transverse).

### M2. Distribution d'activité / anti-burst (NOUVEAU)
- **Quoi** : ratio `activeDays / spanDays` où `spanDays = (lastTx − firstTx)/86400`, + flag « tout dans une fenêtre 48 h ».
  - `spread = clamp(activeDays / max(spanDays,1), 0, 1)` → un wallet régulier a un `spread` élevé pour son span ; un burst a un span minuscule.
  - **Penalty burst** : si `spanDays ≤ 2` ET `txCount ≥ 20` → l'activité est un burst → applique un **malus** (cf. §4.2).
- **Pourquoi** : Arbitrum soustrait 1 pt si toutes les tx dans 48 h ; la recherche académique identifie « activity concentrated in short windows » comme signal sybil dominant. v1 ne capte pas du tout ça.
- **Source** : Arbitrum (pénalité 48 h) ; arxiv.org/pdf/2209.04603 & arxiv.org/abs/2505.09313 (sybil temporal features).
- **Poids** : **8** (nouveau critère, bonus de régularité), + malus séparé (§4.2).

### M3. Volume ETH par paliers logarithmiques + dust filter (RAFFINÉ)
- **Quoi** : Σ `value` en ETH, paliers log (conservés de v1), MAIS :
  - tx de `value < ~$1` (proxy : `< 0.0003 ETH`) **exclues** du compte de volume (dé-pondération dust LayerZero).
  - composante **balance dust** : si solde ETH live `< 0.005 ETH` **ET** `uniqueContracts ≤ 1` → contribue au malus anti-sybil (réplique exacte d'Arbitrum).
- **Pourquoi** : Arbitrum paliers $10k/$50k/$250k + filtre balance ; LayerZero −50 % sur tx < $1.
- **Source** : docs.arbitrum.foundation ; bankless.com/zro (tx < $1 dé-pondérées).
- **Poids** : **10** (inchangé), mais nettoyé du dust.

### M4. Diversité de catégories de protocoles (NOUVEAU, distinct de « contracts touched »)
- **Quoi** : nombre de **catégories distinctes** touchées parmi {DEX, Lending, Perps, Identity, Bridge, NFT, Social} — dérivé du registre de quêtes + `toIsContract`. Pas le nombre de contrats (v1), mais le **nombre de familles**.
- **Pourquoi** : OP overlap bonus récompense le matching de ≥4 jeux de critères (diversité de comportements) ; meta Base = diversité de catégories. Un wallet qui touche 5 catégories ≠ un wallet qui spamme 30 fois Aerodrome.
- **Source** : community.optimism.io/docs/governance/airdrop-1 (overlap bonus) ; docs/research base-airdrop-state (diversité catégories).
- **Poids** : **10**. (Le « contracts touched » brut de v1 fusionne dans M5.)

### M5. Comptage tx + contrats uniques (paliers Arbitrum) — FUSIONNÉ & re-sourcé
- **Quoi** : conserve `txCount` paliers + `uniqueContracts` paliers, mais **re-calibre les paliers sur Arbitrum** (>4 / >10 / >25 / >100 = échelons), au lieu des paliers ronds v1.
- **Pourquoi** : Arbitrum traite « tx OU contrats » par paliers identiques — donne une base sourcée plutôt qu'arbitraire.
- **Source** : docs.arbitrum.foundation (paliers 4/10/25/100).
- **Poids** : **14** (tx) — combine l'ancien « Transactions 20 » réduit + une partie de « contracts ».

### M6. Provenance / Bridge (NOUVEAU léger)
- **Quoi** : flag « a interagi avec le L2 Standard Bridge » (quête bridge existante).
- **Pourquoi** : Arbitrum et OP comptent explicitement le bridging comme critère d'éligibilité. Limite connue : les **dépôts canoniques L1→Base n'apparaissent pas** comme tx L2 (documenté dans le registre) — donc on ne capte que les interactions bridge côté L2. On ne **prétend pas** mesurer la valeur bridgée.
- **Source** : docs.arbitrum.foundation (bridge = critère) ; community.optimism.io (priced-out).
- **Poids** : **4**.

### M7. Identité on-chain (Basename + Smart Wallet + gasless) — REGROUPÉ
- **Quoi** : Basename (`hasBasename`) + Smart Wallet (`usedSmartWallet`) + **bonus gasless** : présence de tx où `from == wallet` mais le wallet est un Smart Wallet (proxy paymaster/sponsored — signal Coinbase).
- **Pourquoi** : Talent « Identity » est une barrière anti-sybil (cap 20) ; Base valorise Smart Wallet + Basenames + gasless comme stack d'identité. C'est LE différenciateur Base vs un L2 générique.
- **Source** : docs.talent.app (Identity cap 20) ; docs.base.org/smart-wallet ; ens.domains/ecosystem/base.
- **Poids** : **8** (Basename 4 + Smart Wallet 4 ; le « gasless » est un sous-signal du Smart Wallet, pas un point séparé pour rester lisible).

### M8. Quêtes (moteur 19 contrats) — CONSERVÉ
- **Quoi** : inchangé, clamp 20. C'est déjà le « menu » de protocoles vérifiés.
- **Pourquoi** : aligné avec « diversité de protocoles » + Talent Activity (interaction protocoles trusted).
- **Source** : community.optimism.io (overlap) ; docs.talent.app (Activity).
- **Poids** : **20** (inchangé).

> Récence pure (dernier tx récent) : **écartée comme critère positif autonome**. Aucune
> source ne récompense la *récence seule* ; OP/Hyperliquid récompensent la *persistance*
> (ancien + toujours actif), déjà capturée par M1 (mois distincts) × wallet age. Ajouter un
> point « tx récente » inciterait un farmer de dernière minute — contraire à la meta. Wallet
> age reste donc un sous-poids de M1 plutôt qu'un critère séparé (voir barème).

---

## 4. Barème v2 /100

### 4.1 Répartition (somme = 100)

| # | Critère (UI label) | Max | Donnée | Source clé |
|---|---|---|---|---|
| M5 | Transactions | **14** | `txCount` paliers Arbitrum | Arbitrum |
| M1 | Active months | **18** | mois distincts | Arbitrum / Starknet |
| M2 | Activity spread | **8** | activeDays/span + flag burst | Arbitrum 48h / arxiv |
| M3 | ETH volume | **10** | Σ value (dust exclu) | Arbitrum / LayerZero |
| — | Contracts touched | **6** | `to` contrats distincts | Arbitrum (contrats) |
| M4 | Protocol diversity | **10** | nb catégories distinctes | OP overlap / Base meta |
| M6 | Bridge | **4** | quête bridge L2 | Arbitrum / OP |
| M7 | Identity (Basename+SW) | **8** | `hasBasename`+`usedSmartWallet` | Talent / Base |
| — | Wallet age | **2** | now − firstTx | Starknet longévité |
| M8 | Quests | **20** | moteur 19 quêtes | OP / Talent |
| | **TOTAL brut** | **100** | | |

> UI : 10 lignes de breakdown (≤12 demandé). « Contracts touched » et « Wallet age »
> restent des lignes fines (6 et 2) mais peuvent être fusionnées visuellement sous M5/M1 si
> besoin de compresser — décision laissée au dev/designer. Le `key` de chaque item reste
> stable pour rétro-compat des hints UI v1.

### 4.2 Malus anti-sybil (appliqué APRÈS la somme, plancher 0)

Réplique honnête d'Arbitrum, **borné** pour ne pas être punitif sur un faux positif (leçon zkSync : ne pas sur-filtrer) :

- **Burst 48 h** : si `spanDays ≤ 2` ET `txCount ≥ 20` → **−6 pts**. (Arbitrum −1/14 ≈ −7 % ; on calibre proportionnel.)
- **Dust mono-contrat** : si solde ETH live `< 0.005` ET `uniqueContracts ≤ 1` → **−4 pts**. (Filtre balance Arbitrum.)
- Malus total cappé à **−10** ; score final = `clamp(somme − malus, 0, 100)`.

Le malus est **affiché explicitement** dans le breakdown (ligne « Sybil flags : −X » seulement si déclenché), pour rester honnête et actionnable.

### 4.3 Dégradation gracieuse
- Si le solde ETH live n'a pas pu être lu (RPC down) → **on n'applique PAS le malus dust** (on n'invente pas une balance). Le flag burst reste calculable (purement temporel).
- `spanDays = 0` (1 seule tx ou toutes le même jour) → `spread = 0`, pas de division par zéro.

---

## 5. Paliers chiffrés (calibration sourcée)

```
Transactions (M5, max 14)  — paliers Arbitrum 4/10/25/100 + extension haute
  >= 100 -> 14 ; >= 25 -> 11 ; >= 10 -> 8 ; >= 4 -> 5 ; >= 1 -> 2 ; 0 -> 0

Active months (M1, max 18) — paliers Arbitrum 2/6/9 + extension
  >= 12 -> 18 ; >= 9 -> 15 ; >= 6 -> 11 ; >= 3 -> 7 ; >= 2 -> 4 ; >= 1 -> 2

Activity spread (M2, max 8) — bonus régularité
  spread >= 0.5 -> 8 ; >= 0.3 -> 6 ; >= 0.15 -> 4 ; >= 0.05 -> 2 ; > 0 -> 1 ; sinon 0
  (spread = activeDays / max(spanDays,1), capé à 1)

ETH volume (M3, max 10) — paliers log, dust (<0.0003 ETH/tx) exclu de la somme
  >= 10 -> 10 ; >= 5 -> 8 ; >= 1 -> 6 ; >= 0.5 -> 4 ; >= 0.1 -> 2 ; >= 0.01 -> 1

Contracts touched (max 6)
  >= 25 -> 6 ; >= 10 -> 5 ; >= 5 -> 3 ; >= 2 -> 2 ; >= 1 -> 1

Protocol diversity (M4, max 10) — nb catégories distinctes (sur 7)
  >= 5 -> 10 ; == 4 -> 8 ; == 3 -> 6 ; == 2 -> 4 ; == 1 -> 2 ; 0 -> 0

Bridge (M6, max 4) : quête bridge L2 done -> 4 ; sinon 0
Identity (M7, max 8) : Basename -> 4, Smart Wallet -> 4 (additif)
Wallet age (max 2) : >= 365j -> 2 ; >= 90j -> 1 ; sinon 0
Quests (M8, max 20) : earned clamp [0,20]
```

---

## 6. Exemples calculés à la main (pour les tests)

### Exemple A — « farmer organique » (profil cible)
Wallet : 180 tx, 11 mois distincts, 95 jours actifs sur un span de 330 j (spread ≈ 0.29),
volume 2.4 ETH (dust déjà exclu), 14 contrats distincts, 5 catégories, bridge ✓,
Basename ✓, Smart Wallet ✓, age 330 j, quests earned 16. Solde 0.08 ETH, span 330 j.

| Critère | Calcul | Pts |
|---|---|---|
| Transactions | 180 ≥ 100 | 14 |
| Active months | 11 ≥ 9 | 15 |
| Activity spread | 0.29 ≥ 0.15 | 4 |
| ETH volume | 2.4 ≥ 1 | 6 |
| Contracts | 14 ≥ 10 | 5 |
| Diversity | 5 cat | 10 |
| Bridge | done | 4 |
| Identity | base ✓ + SW ✓ | 8 |
| Wallet age | 330 ≥ 90 | 1 |
| Quests | 16 | 16 |
| **Somme** | | **83** |
| Malus | span 330 (pas burst), solde 0.08 (pas dust) | 0 |
| **SCORE** | | **83** |

### Exemple B — « sybil burst » (profil pénalisé)
Wallet : 60 tx **toutes sur 1 jour**, 1 mois, 1 jour actif (span 1 j → spread 1 mais flag
burst), volume 0.004 ETH, 1 contrat, 1 catégorie, pas de bridge, pas de Basename,
pas de Smart Wallet, age 1 j, quests 1. Solde 0.002 ETH.

| Critère | Calcul | Pts |
|---|---|---|
| Transactions | 60 ≥ 25 | 11 |
| Active months | 1 | 2 |
| Activity spread | span 1 → spread 1 → 8 | 8 |
| ETH volume | 0.004 < 0.01 | 0 |
| Contracts | 1 | 1 |
| Diversity | 1 cat | 2 |
| Bridge | non | 0 |
| Identity | aucun | 0 |
| Wallet age | 1 j | 0 |
| Quests | 1 | 1 |
| **Somme** | | **25** |
| Malus burst | span ≤ 2 ET txCount ≥ 20 → **−6** | |
| Malus dust | solde 0.002 < 0.005 ET contrats ≤ 1 → **−4** | |
| Malus total (cap −10) | | **−10** |
| **SCORE** | clamp(25 − 10) | **15** |

> Note : le spread « 8 » sur un burst d'1 jour est volontairement neutralisé par le malus
> burst (−6). C'est le point délicat : `spread` seul ne suffit pas, d'où le **flag burst
> dédié** (span court). Les deux ensemble donnent le bon comportement (cf. §4.2).

### Exemple C — « ancien régulier faible volume » (profil OP « priced out »)
Wallet : 40 tx, 14 mois distincts, 38 jours actifs / span 420 j (spread ≈ 0.09),
volume 0.3 ETH, 6 contrats, 3 catégories, bridge ✓, Basename ✓, pas SW, age 420 j,
quests 9. Solde 0.05 ETH.

| Critère | Pts |
|---|---|
| Transactions (40 ≥ 25) | 11 |
| Active months (14 ≥ 12) | 18 |
| Activity spread (0.09 ≥ 0.05) | 2 |
| ETH volume (0.3 ≥ 0.1) | 2 |
| Contracts (6 ≥ 5) | 3 |
| Diversity (3 cat) | 6 |
| Bridge ✓ | 4 |
| Identity (base ✓) | 4 |
| Wallet age (420 ≥ 365) | 2 |
| Quests | 9 |
| **Somme** | **61** |
| Malus | 0 |
| **SCORE** | **61** |

Verdict de calibration : A (organique riche) 83 > C (ancien régulier modeste) 61 > B
(burst dust) 15. L'ordre est conforme à la meta documentée (régularité + diversité +
identité battent le burst volumineux). ✅

---

## 7. Mapping UI (breakdown lisible)

10 lignes max, mêmes `key`/`label` qu'aujourd'hui quand possible (rétro-compat hints) :

```
Transactions        14   (paliers Arbitrum)
Active months       18   (régularité — critère n°1)
Activity spread      8   (anti-burst, NOUVEAU)
ETH volume          10   (dust exclu)
Contracts touched    6
Protocol diversity  10   (NOUVEAU)
Bridge               4   (NOUVEAU)
Identity             8   (Basename + Smart Wallet, regroupé)
Wallet age           2
Quests              20
———
Sybil flags         −X   (affiché SEULEMENT si déclenché)
```

Hints « +X pts » existants (v1) à re-câbler sur les nouveaux critères : `Activity spread`
→ « espace ton activité sur plusieurs jours/mois » ; `Protocol diversity` → « touche une
catégorie de plus (lending, perps, NFT…) » ; `Bridge` → quête bridge ; `Identity` →
mint Basename / passe en Smart Wallet.

---

## 8. Section « anti-sybil honnête »

**Ce qu'on PEUT signaler avec nos données (tx L2 + solde live) :**
- **Burst pattern** : toute l'activité dans une fenêtre ≤ 48 h (span temporel des tx). ✅ Réplique exacte du critère Arbitrum.
- **Dust + mono-contrat** : solde < 0.005 ETH ET ≤ 1 contrat touché. ✅ Réplique Arbitrum.
- **Dust transfers dans le volume** : tx < ~$1 exclues du volume scoré (LayerZero −50 %, ici exclusion binaire). ✅
- **Faible régularité** : activeDays/span bas → activité concentrée. ✅ (signal, pas verdict)

**Ce qu'on NE prétend PAS faire (limites assumées, à dire dans la doc/UI) :**
- ❌ **Clustering multi-wallets** (domino / star financing) : nécessite un graphe inter-adresses + données de financement CEX/IP — hors de portée d'un scan mono-wallet. C'est ce que font Nansen/Chaos Labs (LayerZero) et Trusta Labs ; **on ne le simule pas**.
- ❌ **Valeur bridgée réelle** : les dépôts canoniques L1→Base n'apparaissent pas en tx L2 (limite registre). On ne capte que les interactions bridge côté L2.
- ❌ **Vérification d'identité humaine** (KYC, proof-of-personhood) : Basename/Smart Wallet sont des *proxys* d'identité, pas une preuve anti-sybil forte.
- ❌ **Détection de wash trading** : impossible sans le contexte ordre/contrepartie (Hyperliquid le fait côté plateforme).

Formule de disclaimer UI suggérée : *« Le score anti-sybil de DropRank signale des
patterns individuels (burst, dust) inspirés des critères Arbitrum publiés. Il ne fait PAS
de clustering multi-wallets — un score élevé ne garantit aucune éligibilité. »*

---

## 9. Ce qui invaliderait cette spec
- Si Base publie un jour des **critères officiels** (snapshot/seuils) : cette v2 devient
  obsolète et doit être recalibrée sur les vrais chiffres (comme Arbitrum a fixé les siens).
- Si le cap 10k tx du scan tronque des wallets très actifs : `activeMonths`/`spread` sont
  alors sous-estimés (biais de troncature à documenter — le wallet apparaît plus « burst »
  qu'il n'est si les 10k tx récentes masquent un long historique). **Mitigation** : `txCount`
  réel (non capé) est utilisé pour M5 ; mais les métriques temporelles dépendent des `txs`
  matérialisées. À surveiller : si `txCount > txs.length`, marquer la confiance temporelle
  comme « partielle » dans l'UI.
- Si l'appel `eth_getBalance` est instable en prod : le malus dust ne se déclenche jamais
  (dégradation §4.3) — acceptable, le score reste valide sans lui.

---

## 10. Handoff dev (prochaine étape)
Implémentation par **developpeur-senior** :
1. `lib/scoring.ts` : nouveaux paliers (§5), 2 nouveaux critères (spread, diversity, bridge regroupé), malus (§4.2). Garder `computeScore` pur et déterministe.
2. `lib/score-address.ts` : ajouter 1 lecture `eth_getBalance` (RPC `mainnet.base.org`, never-fail) passée dans `WalletData` (nouveau champ `balanceWei?: string`). Diversity dérivée du résultat quêtes (catégories) — passer le détail catégoriel depuis `computeQuests`.
3. `lib/types.ts` : `WalletData.balanceWei?`, et exposer la catégorie par quête dans le moteur (ou un set de catégories touchées).
4. Tests : porter les 3 exemples §6 en cas de test (table-driven), + cas dégradés (balance absente, span 0, txCount > txs.length).
5. UI `app/score/page.tsx` : ligne « Activity spread », « Protocol diversity », « Bridge », « Identity » regroupée, ligne malus conditionnelle ; re-câbler les hints.

---

## Sources (Phase 1)
- Arbitrum (officiel) : https://docs.arbitrum.foundation/airdrop-eligibility-distribution
- Optimism Airdrop 1 (officiel) : https://community.optimism.io/docs/governance/airdrop-1/
- zkSync ZK (officiel ZK Nation) : https://docs.zknation.io/zk-token/zk-airdrop
- Starknet (StarkWare) : https://starkware.co/integrity-matters-blog/airdrop-reflections/
- LayerZero ZRO : https://www.bankless.com/everything-you-need-to-know-about-layerzeros-zro-airdrop
- Hyperliquid : https://coinmarketcap.com/academy/article/hyperliquid-airdrop-guide-what-is-hyperliquid-how-to-participate-and-what-it-means-for-defi
- Talent Builder Score (officiel) : https://docs.talent.app/docs/protocol-concepts/scoring-systems/builder-score/scoring-data + https://mirror.xyz/talentprotocol.eth/PGwRyGzyMMPN-ioLQxSQueEuJzTr4E0UbsJsbua-lwE (Builder Score V2)
- Base Smart Wallet / gasless (officiel) : https://docs.base.org/smart-wallet/quickstart + https://docs.cdp.coinbase.com/paymaster/guides/paymaster-masterclass
- Base + ENS/Basenames : https://ens.domains/ecosystem/base
- Sybil detection académique : https://arxiv.org/pdf/2209.04603 + https://arxiv.org/abs/2505.09313
- État farming Base (interne, daté) : `docs/research/2026-06-04-base-airdrop-state.md`

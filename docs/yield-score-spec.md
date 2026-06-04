# Yield Score — Spec de scoring (onglet rendements/staking DropRank)

> Spec exécutable pour implémentation **TypeScript pur**. Aucune dépendance ML.
> Source de données : `GET https://yields.llama.fi/pools` (filtre `chain === "Base"`).
> Calibrée sur les données réelles du **2026-06-04** (2439 pools Base).
> Auteur : analyste-quantitatif. Statut : prêt pour implémentation + tests.

---

## 0. Principe

On ne classe **jamais** par APY brut. On calcule un **score risk-adjusted [0..100] par profil**, où chaque pool passe d'abord par un **filtre d'éligibilité** (qui décide *dans quel profil* il peut apparaître), puis par une **formule de score** (qui décide *de son rang* dans ce profil).

Trois profils, du plus prudent au plus risqué :

| Profil  | Cible utilisateur | Univers |
|---------|-------------------|---------|
| STABLE  | « je veux du rendement sans bouger en USD » | stablecoins, IL no |
| MAJORS  | « je stake mon ETH/BTC » | ETH/BTC/LSTs single-asset, IL no |
| DEGEN   | « montre-moi le high yield, je connais les risques » | tout le reste, badgé |

**Règle anti-piège centrale** : un APY de 5000 % sur un pool memecoin TVL 1 M$ doit être *mathématiquement enterré*, pas filtré au cas par cas. Vérifié empiriquement : `aerodrome-v1/USDC-NOCK` (APY 7592 %) finit **rang 107/134 en DEGEN** (score 2.8/100) et n'est **éligible à aucun** des profils STABLE/MAJORS.

---

## 1. Champs source utilisés

Tous proviennent directement de l'objet pool de `yields.llama.fi/pools`. **Nullabilité réelle observée sur Base** (à gérer en TS) :

| Champ | Type | Null possible ? | Usage |
|-------|------|-----------------|-------|
| `chain` | string | non | filtre `=== "Base"` |
| `project` | string | non | affichage + clé |
| `symbol` | string | non | matching tokens majors, affichage |
| `tvlUsd` | number | non (mais peut être 0) | filtre + facteur confiance |
| `apy` | number | **oui** | rendement total (base + reward), peut être null |
| `apyBase` | number | **oui** (souvent null sur pools reward-only) | part organique |
| `apyReward` | number | **oui** (souvent null sur lending) | part incentive |
| `stablecoin` | boolean | non | éligibilité STABLE |
| `ilRisk` | `"yes"\|"no"` | non | filtre + pénalité |
| `exposure` | `"single"\|"multi"` | non | filtre STABLE/MAJORS |
| `apyPct7D` | number | **oui** | facteur tendance |
| `sigma` | number | non (toujours présent sur Base, 0 OK) | volatilité du rendement → pénalité |
| `predictions.predictedClass` | `"Down"\|"Stable/Up"\|"Up"` | **oui** (objet présent, champ parfois null) | facteur prédiction |
| `predictions.predictedProbability` | number (0..100) | oui | intensité du facteur prédiction |

> **Garde-fou TS obligatoire** : toujours passer chaque numérique nullable par `const num = (x: number\|null\|undefined) => (x == null || Number.isNaN(x)) ? 0 : x;`. Observé : `apy`, `apyBase`, `apyReward`, `apyPct7D`, `predictedClass`, `predictedProbability` peuvent être null **même quand l'objet parent existe**.

---

## 2. Helpers (fonctions simples, TS pur)

```ts
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (x: number | null | undefined) =>
  (x == null || Number.isNaN(x)) ? 0 : x;
```

### 2.1 Sustainability — part organique du rendement (0..1)

Pénalise les pools dont le rendement vient majoritairement d'incentives (`apyReward >> apyBase`), structurellement insoutenables.

```ts
function sustainability(p: Pool): number {
  const apy = num(p.apy);
  if (apy <= 0) return 1;                       // pas de rendement => pas de risque d'insoutenabilité
  if (p.apyBase == null && p.apyReward == null) return 1; // lending sans split => traité organique
  const base = Math.max(0, num(p.apyBase));
  const reward = Math.max(0, num(p.apyReward));
  const total = base + reward;
  if (total <= 0) return 1;
  return clamp(base / total, 0, 1);             // 1 = 100% organique, 0 = 100% incentive
}
```

### 2.2 Sigma — facteur de volatilité du rendement (0.2..1)

`sigma` = écart-type du rendement (fourni par DefiLlama). C'est le **signal anti-piège le plus discriminant** : les pools insoutenables ont sigma > 1 (LP volatils, memecoins atteignent sigma 3–11), les pools sains ont sigma < 0.3.

```ts
function sigmaFactor(p: Pool): number {
  return clamp(1 / (1 + 0.6 * num(p.sigma)), 0.2, 1);
}
// sigma 0.04 -> 0.98 | sigma 0.3 -> 0.85 | sigma 1.6 -> 0.51 | sigma 10.7 -> 0.20 (plancher)
```

### 2.3 Prédiction — facteur directionnel (0.6..1.1)

Le modèle DefiLlama prédit la direction du rendement. `Down` à forte proba = rendement qui s'effondre (typique des farms d'incentives qui se vident).

```ts
function predictionFactor(p: Pool): number {
  const cls = p.predictions?.predictedClass;
  if (!cls) return 1;
  const prob = clamp(num(p.predictions?.predictedProbability) / 100, 0, 1);
  if (cls === "Down") return clamp(1 - 0.4 * prob, 0.6, 1);          // jusqu'à -40%
  if (cls === "Up" || cls === "Stable/Up") return clamp(1 + 0.1 * prob, 1, 1.1); // léger bonus
  return 1;
}
```

### 2.4 Tendance 7j — facteur de momentum (0.7..1.1)

Léger : un APY qui s'écroule sur 7j est un signal de farm qui se vide. Effet volontairement faible (le gros du travail est fait par sigma + prédiction).

```ts
function trendFactor(p: Pool): number {
  if (p.apyPct7D == null) return 1;
  return clamp(1 + (p.apyPct7D / 100) * 0.15, 0.7, 1.1);
}
```

### 2.5 TVL — facteur de confiance (0..1)

Pénalise les TVL faibles (rug-prone, liquidité fine). Saturant en log : passé ~20× le seuil minimum, plus de bonus. `minTvl` = le floor d'éligibilité du profil.

```ts
function tvlFactor(p: Pool, minTvl: number): number {
  const t = Math.max(0, num(p.tvlUsd));
  return clamp(Math.log10(t / minTvl + 1) / Math.log10(20), 0, 1);
}
// au floor: ~0.23 | 5x floor: ~0.6 | 20x floor: ~1.0
```

### 2.6 Pénalité IL (impermanent loss)

```ts
function ilPenalty(p: Pool): number {
  return p.ilRisk === "yes" ? 0.55 : 1;
}
```

---

## 3. Filtres d'éligibilité par profil

Un pool peut être éligible à **plusieurs** profils (rare) ou aucun. La majorité des 2439 pools Base ne sont éligibles à aucun profil (TVL < 1 M$) — c'est voulu : on n'expose que du « scorable sérieusement ».

```ts
// Whitelist tokens majors : symbol single-asset exact (insensible à la casse)
const MAJORS_RE =
  /^(WETH|ETH|CBBTC|BTC|CBETH|WSTETH|WEETH|RETH|EZETH|TBTC|LBTC|RSETH|WRSETH|MSETH)$/i;

function eligible(p: Pool, profile: "STABLE" | "MAJORS" | "DEGEN"): boolean {
  const t = num(p.tvlUsd);
  if (profile === "STABLE") {
    return p.stablecoin === true && p.ilRisk === "no" && t >= 500_000;
  }
  if (profile === "MAJORS") {
    return MAJORS_RE.test(p.symbol) && p.exposure === "single"
        && p.ilRisk === "no" && t >= 1_000_000;
  }
  // DEGEN = le reste, avec un floor TVL anti-rug
  return t >= 1_000_000 && !p.stablecoin && !MAJORS_RE.test(p.symbol);
}
```

Notes de design :
- **STABLE** exige `stablecoin === true` ET `ilRisk === "no"`. Floor 500 k$ (les bons stables Base — morpho, spark, aave — sont à 8 chiffres). On **ne force pas** `exposure === "single"` car des paires stable-stable légitimes (USDC-USDS, sUSDz-USDz à très bas sigma) sont valables ; sigma + IL no les gardent propres.
- **MAJORS** exige `exposure === "single"` ET `ilRisk === "no"` : c'est ce qui élimine les pièges `WETH-DEGEN` / `WETH-CBBTC` LP (qui ont `ilRisk: "yes"`, `exposure: "multi"`) du profil ETH/BTC. Sans ce filtre, des LP volatils à 200–500 % APY polluaient le top MAJORS. Floor 1 M$.
- **DEGEN** = complément. Floor 1 M$ (anti-rug minimal) ; IL et sigma ne filtrent pas ici mais **pénalisent dans le score** (le degen assume le risque, mais on ne récompense pas l'insoutenable).

---

## 4. Formule de score

```ts
function yieldScore(p: Pool, profile: "STABLE" | "MAJORS" | "DEGEN"): number {
  // 1) Composante rendement : log, et APY CAPÉ À 300% pour tuer la domination des APY absurdes.
  //    Au-delà de 300%, le rendement n'apporte plus de points — seul le risque peut retirer.
  const yieldComp = Math.log10(1 + clamp(num(p.apy), 0, 300));

  let s = yieldComp;
  s *= 0.5 + 0.5 * sustainability(p);  // multiplicateur 0.5..1 (reward-heavy => -50% max)
  s *= sigmaFactor(p);                 // 0.2..1
  s *= predictionFactor(p);            // 0.6..1.1
  s *= trendFactor(p);                 // 0.7..1.1

  if (profile === "DEGEN") {
    s *= 0.3 + 0.7 * tvlFactor(p, 1_000_000); // TVL compte moins (0.3 plancher), mais compte
    s *= ilPenalty(p);                        // IL pénalise sans exclure
  } else {
    s *= tvlFactor(p, profile === "STABLE" ? 1_000_000 : 1_000_000);
    s *= ilPenalty(p); // STABLE/MAJORS sont déjà ilRisk:no => no-op, gardé par robustesse
  }

  return s * 100;
}
```

### Pondérations — justification de chaque coefficient

| Brique | Plage | Pourquoi ce poids |
|--------|-------|-------------------|
| `log10(1+min(apy,300))` | 0 → ~2.48 | Log = rendements décroissants (5 % vs 10 % compte plus que 200 % vs 300 %). **Cap 300 %** = au-delà, +0 point : neutralise les farms 5000 %. |
| sustainability `0.5+0.5·s` | ×0.5..1 | Reward-only pénalisé de moitié vs organique. Pas ×0 : un reward peut durer quelques semaines. |
| sigmaFactor | ×0.2..1 | Le discriminant principal. Plancher 0.2 pour ne pas annuler totalement (garder un classement entre pièges). |
| predictionFactor | ×0.6..1.1 | « Down 100 % » = ×0.6. Asymétrique : on punit fort le déclin, on récompense peu la hausse (anti-FOMO). |
| trendFactor | ×0.7..1.1 | Effet faible volontaire : `apyPct7D` est bruité. |
| tvlFactor | ×0..1 (STABLE/MAJORS), ×0.3..1 (DEGEN) | TVL = proxy de confiance/liquidité. DEGEN tolère des TVL plus bas mais pas zéro. |
| ilPenalty | ×0.55 (yes) | LP volatil = -45 %. Actif seulement en DEGEN en pratique. |

> **Échelle** : les scores ne sont pas garantis d'atteindre 100 (max observé ~73 en STABLE). C'est intentionnel — le score est un **classement relatif** dans un profil, pas une note absolue. Si l'UI a besoin d'un 0–100 visuel, normaliser par `score / maxScoreDuProfil * 100` à l'affichage **uniquement** (ne pas re-trier dessus). Recommandation : afficher le score brut arrondi, le rang fait foi.

---

## 5. Pipeline complet

```ts
function rankProfile(pools: Pool[], profile: "STABLE" | "MAJORS" | "DEGEN") {
  return pools
    .filter(p => p.chain === "Base")
    .filter(p => eligible(p, profile))
    .map(p => ({ pool: p, score: yieldScore(p, profile) }))
    .sort((a, b) => b.score - a.score);
}
```

---

## 6. Exemples calculés à la main (pour les tests du dev)

Valeurs figées au 2026-06-04 (source `yields.llama.fi/pools`). **Important** : ces APY évoluent en continu ; pour les tests unitaires, **figer les inputs en mock** (ne pas fetcher l'API en test). Les scores ci-dessous sont calculés avec les formules de cette spec — le dev doit les reproduire au centième près.

### Exemple A — STABLE : `morpho-blue / STEAKUSDC`
Inputs : `apy=4.03522`, `apyBase=4.03522`, `apyReward=0`, `tvlUsd=337_479_830`, `sigma=0.03827`, `ilRisk="no"`, `stablecoin=true`, `exposure="single"`, `apyPct7D=-0.69293`, `predictions={predictedClass:"Stable/Up", predictedProbability:55}`

- éligible STABLE ? stablecoin ✓, ilRisk no ✓, tvl 337 M ≥ 500 k ✓ → **oui**
- yieldComp = log10(1 + min(4.03522, 300)) = log10(5.03522) = **0.70197**
- sustainability = 4.03522 / 4.03522 = 1 → mult = 0.5 + 0.5·1 = **1.0**
- sigmaFactor = 1/(1 + 0.6·0.03827) = 1/1.022962 = **0.97755**
- predictionFactor = Stable/Up, prob 0.55 → 1 + 0.1·0.55 = **1.055**
- trendFactor = 1 + (−0.69293/100)·0.15 = 1 − 0.0010394 = **0.99896**
- tvlFactor(1e6) = log10(337.48 + 1)/log10(20) = log10(338.48)/1.30103 = 2.52938/1.30103 = clamp→ **1.0**
- ilPenalty = 1
- **score = 0.70197 · 1.0 · 0.97755 · 1.055 · 0.99896 · 1.0 · 1 · 100 ≈ 72.31**

→ test attendu : `score("STEAKUSDC", "STABLE") ≈ 72.3` (±0.1)

### Exemple B — MAJORS : `ether.fi-stake / WEETH`
Inputs : `apy=3.04332`, `apyBase=2.98201`, `apyReward=0.06132`, `tvlUsd=55_200_200`, `sigma=0.03075`, `ilRisk="no"`, `exposure="single"`, `stablecoin=false`, `apyPct7D=0.61638`, `predictions={predictedClass:"Stable/Up", predictedProbability:51}`

- éligible MAJORS ? symbol `WEETH` ∈ whitelist ✓, single ✓, ilRisk no ✓, tvl 55 M ≥ 1 M ✓ → **oui**
- yieldComp = log10(1 + 3.04332) = log10(4.04332) = **0.60674**
- sustainability = 2.98201 / (2.98201 + 0.06132) = 2.98201/3.04333 = 0.97985 → mult = 0.5 + 0.5·0.97985 = **0.98993**
- sigmaFactor = 1/(1 + 0.6·0.03075) = 1/1.01845 = **0.98188**
- predictionFactor = Stable/Up, prob 0.51 → 1 + 0.1·0.51 = **1.051**
- trendFactor = 1 + (0.61638/100)·0.15 = 1 + 0.000925 = **1.00092**
- tvlFactor(1e6) = log10(55.2 + 1)/log10(20) = log10(56.2)/1.30103 = 1.74974/1.30103 = clamp→ **1.0**
- ilPenalty = 1
- **score = 0.60674 · 0.98993 · 0.98188 · 1.051 · 1.00092 · 1.0 · 1 · 100 ≈ 61.98**

→ test attendu : `score("WEETH", "MAJORS") ≈ 62.0` (±0.1)

### Exemple C — DEGEN (le PIÈGE qui doit couler) : `aerodrome-v1 / USDC-NOCK`
Inputs : `apy=7592.47825`, `apyBase=null`, `apyReward=7592.47825`, `tvlUsd=1_236_914`, `sigma=10.69551`, `ilRisk="yes"`, `exposure="multi"`, `stablecoin=false`, `apyPct7D=-928.63379`, `predictions={predictedClass:"Down", predictedProbability:100}`

- éligible DEGEN ? tvl 1.24 M ≥ 1 M ✓, pas stable ✓, symbol pas majors ✓ → **oui** (mais doit finir au fond)
- yieldComp = log10(1 + min(7592.48, **300**)) = log10(301) = **2.47857** ← le cap fait son travail
- sustainability : apyBase null + apyReward présent → base=0, reward=7592.48, total>0 → 0/7592.48 = 0 → mult = 0.5 + 0.5·0 = **0.5**
- sigmaFactor = 1/(1 + 0.6·10.69551) = 1/7.41731 = **0.13482** → clamp plancher → **0.20**
- predictionFactor = Down, prob 1.0 → 1 − 0.4·1 = **0.60**
- trendFactor = 1 + (−928.63379/100)·0.15 = 1 − 1.3929 = −0.3929 → clamp → **0.70**
- tvlFactor(1e6) = log10(1.23691 + 1)/log10(20) = log10(2.23691)/1.30103 = 0.34951/1.30103 = **0.26864**
  - DEGEN : 0.3 + 0.7·0.26864 = **0.48805**
- ilPenalty = yes → **0.55**
- **score = 2.47857 · 0.5 · 0.20 · 0.60 · 0.70 · 0.48805 · 0.55 · 100 ≈ 2.80**

→ test attendu : `score("USDC-NOCK", "DEGEN") ≈ 2.8` (±0.1), et **doit être classé dans le dernier quartile** de DEGEN (vérifié : rang 107/134 sur les données du jour).

> Assertion de test recommandée la plus robuste (indépendante des données futures) :
> `score(USDC_NOCK, "DEGEN") < score(any_clean_pool, "DEGEN")` ET
> `eligible(USDC_NOCK, "STABLE") === false` ET `eligible(USDC_NOCK, "MAJORS") === false`.

---

## 7. Champs à exposer côté UI

Par carte de pool, dériver depuis l'objet source (pas de calcul lourd côté front) :

| Élément UI | Source / dérivation | Format |
|------------|---------------------|--------|
| **APY total** | `apy` | `4.04%` (2 déc.) |
| **APY décomposé** | `apyBase` / `apyReward` | « 3.0% base + 0.1% reward » ; si `apyReward/apy > 0.5` → tag **« incentivé »** |
| **Badge IL** | `ilRisk` | `ilRisk==="yes"` → pastille orange « IL »; `"no"` → rien ou pastille verte « no IL » |
| **Badge exposition** | `exposure` | « single » / « LP » (`multi`) |
| **Tendance 7j** | `apyPct7D` | flèche ↑/↓ + `±X%` ; rouge si < −10 %, vert si > +10 % |
| **Confiance / prédiction** | `predictions.predictedClass` + `predictedProbability` | « Stable/Up 80% » (vert) / « Down 100% » (rouge) |
| **Volatilité** | `sigma` | jauge 3 niveaux : `<0.3` faible (vert), `0.3–1` moyen (jaune), `>1` élevé (rouge) |
| **TVL** | `tvlUsd` | format compact `$337.5M` |
| **Score** | `yieldScore` | nombre arrondi + rang ; option : normaliser /maxProfil pour barre 0–100 (affichage only) |
| **Lien** | `project` + `pool` | deep-link app du protocole (à mapper côté DropRank) |
| **Sustainability flag** | `sustainability(p) < 0.5` | tag **« reward-driven »** (rendement majoritairement incentive, peut chuter) |

**Recommandation produit** : afficher en tête de chaque profil un disclaimer court selon le risque (STABLE : « rendement stable, capital en USD » / MAJORS : « tu restes exposé au prix ETH/BTC » / DEGEN : « high yield, risque de perte élevé — IL, volatilité, incentives »).

---

## 8. Validation empirique (2026-06-04, 2439 pools Base)

Top produit par la formule, vérifié à la main, **aucun piège évident ne remonte** :

- **STABLE** top 5 : morpho-blue (FRUSDC, RWAUSDI, PUSDC, GTUSDCP, STEAKUSDC) — blue-chips, sigma < 0.05, TVL 8–9 chiffres, prédiction Stable/Up. ✓
- **MAJORS** top 5 : ether.fi WEETH, aave-v3 WETH, yo-protocol WETH, fusion-by-ipor CBETH, vesper MSETH — tous single-asset ilRisk:no. Les LP `WETH-DEGEN`/`WETH-CBBTC` 200–500 % sont **exclus** (multi/ilRisk:yes). ✓
- **DEGEN** top 5 : iaero-protocol IAERO (22 % organique, sigma 0.46), origin-ether SUPEROETHB (TVL 35 M), uniswap WETH-USDC (TVL 106 M, badgé IL+sigma), morpho YIELDFARMING, uniswap WETH-CBBTC. Les memecoins 5000 %+ → **dernier quartile** (USDC-NOCK rang 107/134). ✓

**Ce qui invaliderait la calibration** (à re-checker si refonte) :
1. DefiLlama arrête de fournir `sigma` ou `predictions` sur Base → la formule perd ses 2 garde-fous principaux. Fallback : durcir le cap APY à 100 % et le floor TVL à 5 M$.
2. Un protocole de rug crée un pool TVL > 1 M$ artificiel avec apyBase déclaré (contournant le sustainability penalty). → ajouter une heuristique d'âge de pool (champ non présent ici) ou une allowlist de `project` en v2.
3. Si l'UI re-trie sur le score normalisé /100 par profil au lieu du score brut → casse le classement inter-pool. Trier **toujours** sur le score brut.

---

## 9. Résumé pour le dev

1. Fetch `yields.llama.fi/pools`, garde `chain === "Base"`.
2. Pour chaque profil : `eligible()` puis `yieldScore()` puis `sort desc`.
3. Helpers section 2 = copier tel quel (TS pur, zéro dépendance).
4. Tests : figer les 3 mocks section 6, asserter scores ≈ 72.3 / 62.0 / 2.8 + les invariants d'éligibilité du piège.
5. UI : mapper les champs section 7. Trier sur score brut, normaliser seulement pour l'affichage visuel.

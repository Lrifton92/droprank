"use client";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatUsd } from "../_components/presentation";
import { YIELD_CHAINS, ALL_SLUG, type ChainSlug, type YieldPool, type YieldsResult } from "@/lib/yields";
import InfoTip from "../_components/InfoTip";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import BackArrow from "../_components/BackArrow";
import styles from "./yields.module.css";

type ProfileKey = "stable" | "majors" | "degen";
const PROFILES: { key: ProfileKey; icon: string }[] = [
  { key: "stable", icon: "🛡" },
  { key: "majors", icon: "⚡" },
  { key: "degen", icon: "🎲" },
];

/** Ordered chain pills, driven straight off the backend's YIELD_CHAINS map so
 *  adding a chain there surfaces a pill here with zero UI change. Labels are
 *  proper names — not translated (BASE / ETHEREUM / OP MAINNET / ARBITRUM). */
const CHAINS = Object.entries(YIELD_CHAINS) as [ChainSlug, { label: string }][];

/** The chain selection: a real chain slug, or the "all" aggregation mode. */
type ChainChoice = ChainSlug | typeof ALL_SLUG;

/** Compact per-network tag shown on each row + the hero in "all" mode only.
 *  Short network codes, not translatable text (same convention as the pill
 *  labels above): BASE / ETH / OP / ARB. */
const CHAIN_ABBR: Record<ChainSlug, string> = {
  base: "BASE",
  ethereum: "ETH",
  op: "OP",
  arbitrum: "ARB",
};

/** Reduced-motion preference, read synchronously on first render (this only ever
 *  mounts client-side — the whole page is "use client" and count-up components
 *  mount only after the client fetch resolves, so window is always defined and
 *  no 0→value flash precedes the gate). Guards count-up so reduced-motion users
 *  get the final value immediately, never a climbing digit. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Sigma above which a pool's yield is flagged "volatile". Empirical: DefiLlama
 *  sigma clusters < 0.5 for stable pools; 1+ is genuinely choppy. */
const SIGMA_VOLATILE = 1;

/** Compact APY: tabular, 2 decimals under 100, 1 above (a 312% pool needn't show
 *  cents). Negative/NaN guarded by the source (apy is num()-clamped to ≥0). */
function fmtApy(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0%";
  return n >= 100 ? `${n.toFixed(1)}%` : `${n.toFixed(2)}%`;
}

/** APY value that counts up 0 → `value` over ~600ms on mount (and on remount,
 *  i.e. profile/chain switch — the results block is keyed so these remount).
 *  tabular-nums (the parent .apyVal is mono) keeps the digit box fixed so the
 *  climbing number never shifts layout. ease-out (1-(1-t)³) lands soft.
 *  reduced-motion / SSR → final value immediately, no animation. Each instance
 *  is an isolated leaf: its per-frame state update re-renders only its own tiny
 *  <span>, never the parent rows — so 15 climbing at once stay 60fps.
 *  `delay` (s) syncs each row's count-up to its row's entry-cascade slot. */
function CountUpApy({ value, delay = 0 }: { value: number; delay?: number }) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced || !Number.isFinite(value) || value <= 0) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const DUR = 600;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / DUR);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    // Hold at 0 for the row's stagger slot, then climb — so the digit starts
    // moving exactly as its row finishes sliding in (not before it's visible).
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay * 1000);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, delay, reduced]);

  return <span>{fmtApy(display)}</span>;
}

/** Primary click target = the protocol's own site (`projectUrl`), falling back to
 *  the DefiLlama pool page when the backend has no official URL for it. The
 *  secondary "defillama ↗" link always points at `pool.url` for research. */
function siteUrl(pool: YieldPool): string {
  return pool.projectUrl ?? pool.url;
}

function YieldsInner() {
  const params = useSearchParams();
  const t = useTranslations("yields");
  const tc = useTranslations("common");
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  const [data, setData] = useState<YieldsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [chain, setChain] = useState<ChainChoice>("base");
  const [profile, setProfile] = useState<ProfileKey>("stable");
  const [legalOpen, setLegalOpen] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    // Same AbortController pattern as before; chain just adds ?chain= and a dep.
    // A new chain abort-cancels any in-flight request before issuing the next.
    fetch(`/api/yields?chain=${chain}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: YieldsResult) => setData(d))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
  }, [reload, chain]);

  const pools: YieldPool[] = data?.profiles[profile] ?? [];
  const [hero, ...rest] = pools;

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell dr-wide`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <Link href={`/menu${qs}`} className={`dr-back-host ${styles.back}`} aria-label={tc("back")}>
            <BackArrow />
            <span className={styles.backLabel}>MENU</span>
          </Link>
          <span className="dr-eyebrow">{t("eyebrow")}</span>
          <LocaleSwitcher />
        </header>

        {/* Chain selector — mono pills, one per supported chain. Picking a chain
            refetches (?chain=) and the active pill mirrors the active profile
            tab's styling. Labels are proper names, never translated. */}
        <div
          className={`dr-enter ${styles.chainRow}`}
          role="tablist"
          aria-label={t("chainLabel")}
          style={{ "--i": 1 } as CSSProperties}
        >
          {/* "ALL" / "TOUS" first — aggregates every chain into one leaderboard. */}
          <button
            role="tab"
            aria-selected={chain === ALL_SLUG}
            className={`${styles.chainPill} ${chain === ALL_SLUG ? styles.chainPillOn : ""}`}
            onClick={() => setChain(ALL_SLUG)}
          >
            {t("allNetworks")}
          </button>
          {CHAINS.map(([slug, { label }]) => (
            <button
              key={slug}
              role="tab"
              aria-selected={chain === slug}
              className={`${styles.chainPill} ${chain === slug ? styles.chainPillOn : ""}`}
              onClick={() => setChain(slug)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Profile tabs — always visible (even while loading) so the switch is
            instant once data lands. Scrollable on narrow webviews. */}
        <div
          className={`dr-enter ${styles.tabs}`}
          role="tablist"
          style={{ "--i": 2 } as CSSProperties}
        >
          {PROFILES.map(({ key, icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={profile === key}
              className={`${styles.tab} ${profile === key ? styles.tabOn : ""}`}
              onClick={() => setProfile(key)}
            >
              <span className={styles.tabIcon} aria-hidden>{icon}</span>
              <span className={styles.tabName}>{t(`profile.${key}`)}</span>
            </button>
          ))}
        </div>
        <p className={`dr-enter ${styles.profileHint}`} style={{ "--i": 3 } as CSSProperties}>
          {t(`profile.${profile}Hint`)}
        </p>

        {error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("offline")}</p>
            <p className={`mono ${styles.stateErr}`}>{error || t("offlineSub")}</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => setReload((n) => n + 1)}>
              {tc("retry")}
            </button>
          </div>
        )}

        {!data && !error && <YieldsSkeleton />}

        {data && !error && pools.length === 0 && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("noSignal")}</p>
            <p className={`mono ${styles.stateErr}`}>{t("empty")}</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => setReload((n) => n + 1)}>
              {tc("rescan")}
            </button>
          </div>
        )}

        {data && !error && pools.length > 0 && (
          // Keyed on chain+profile so switching either remounts this block and
          // replays the staggered entry cascade + the APY count-ups. Header,
          // chain pills and profile tabs stay outside the key → they don't
          // re-animate on every switch (only the results do).
          <div key={`${chain}:${profile}`}>
            <div className={`dr-enter ${styles.meta}`} style={{ "--i": 0 } as CSSProperties}>
              <span className={`mono ${styles.count}`}>
                <span className="syn-num">{pools.length}</span> {t("pools")} ·{" "}
                {/* Label from the LOCAL selection, not the response: a cached
                    payload predating a shape change must never crash the UI
                    (same stale-cache class as the score/quests bug). */}
                <span className={styles.chainTag}>
                  {chain === ALL_SLUG ? t("allNetworks") : YIELD_CHAINS[chain].label}
                </span>
              </span>
              <span className={`mono ${styles.updated}`}>
                <i className={styles.liveDot} aria-hidden />
                {updatedLabel(data.updatedAt, t)}
              </span>
            </div>

            {/* TOP RATED hero — top 1 by score. Wording is strictly factual.
                In "all" mode each card also carries its network tag. */}
            {hero && <HeroPool pool={hero} t={t} showChain={chain === ALL_SLUG} />}

            {/* No .dr-enter on the <ul> itself: the rows carry their own marked
                staggered cascade (yld-row-in), so the container must not also
                fade in or the two motions would superimpose. */}
            <ul className={styles.list}>
              {rest.map((p, i) => {
                const delay = Math.min(i, 12) * 0.04;
                return (
                  <PoolRow
                    key={p.pool}
                    pool={p}
                    rank={i + 2}
                    t={t}
                    delay={delay}
                    showChain={chain === ALL_SLUG}
                  />
                );
              })}
            </ul>

            {/* Permanent short disclaimer + dépliant for the full legal text. */}
            <div className={`dr-enter ${styles.disclaimer}`} style={{ "--i": 3 } as CSSProperties}>
              <p className={styles.disShort}>{t("disclaimerShort")}</p>
              <button
                type="button"
                className={styles.legalBtn}
                aria-expanded={legalOpen}
                onClick={() => setLegalOpen(true)}
              >
                <span className={styles.legalI} aria-hidden>ⓘ</span>
                {t("legalLabel")}
              </button>
            </div>
          </div>
        )}

        {legalOpen && <LegalSheet t={t} onClose={() => setLegalOpen(false)} />}
      </main>
    </>
  );
}

/** "updated 3m ago" / "just now" / "2h ago", localized via i18n buckets. */
function updatedLabel(iso: string, t: ReturnType<typeof useTranslations>): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const min = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (min < 1) return t("updatedNow");
  if (min < 60) return t("updated", { min });
  return t("updatedHours", { h: Math.floor(min / 60) });
}

/** Discrete risk flags for a pool, in priority order. Each is a tiny coloured
 *  dot + mono abbreviation (IL / REW / σ / ↓7d) carrying the full explanation in
 *  its title (full label + explanation on hover/long-press), so flags read as
 *  secondary info inline rather than stacked alarm pills. Severity: IL &
 *  reward-driven = amber caution; volatile = violet variance; a predicted-down
 *  trend is the only real downside → red. */
function RiskBadges({ pool, t }: { pool: YieldPool; t: ReturnType<typeof useTranslations> }) {
  const badges: { kind: string; cls: string }[] = [];
  if (pool.ilRisk === "yes") badges.push({ kind: "il", cls: styles.bIl });
  if (pool.sustainability < 0.5) badges.push({ kind: "rewardDriven", cls: styles.bReward });
  if (pool.sigma >= SIGMA_VOLATILE) badges.push({ kind: "volatile", cls: styles.bVolatile });
  if (pool.predictedClass === "Down") badges.push({ kind: "trendDown", cls: styles.bDown });
  if (badges.length === 0) return null;
  return (
    <span className={styles.badges}>
      {badges.map(({ kind, cls }) => (
        <span
          key={kind}
          className={`mono ${styles.badge} ${cls}`}
          title={`${t(`badge.${kind}`)} — ${t(`badge.${kind}Hint`)}`}
        >
          <i className={styles.dot} aria-hidden />
          {t(`badge.${kind}Short`)}
        </span>
      ))}
    </span>
  );
}

/** Compact network tag (BASE / ETH / OP / ARB), shown only in "all" mode so each
 *  ranked pool reveals its chain. Sits in the id zone (next to the symbol) so it
 *  never shifts the row's columns. Styled neutral/discrete like the flags — not
 *  an alarm — via its own mono pill. */
function ChainBadge({ chain }: { chain: ChainSlug }) {
  return <span className={`mono ${styles.chainBadge}`}>{CHAIN_ABBR[chain]}</span>;
}

/** Total APY, right-aligned in its own fixed column so it tabulates across every
 *  row and the hero. `big` sizes the hero digits. The base/reward split only
 *  shows in the hero (`big`): suppressing it in list rows keeps every row the
 *  exact same height — the masonry "dance" was largely this sub-line. */
function ApyBlock({ pool, big, delay = 0, t }: { pool: YieldPool; big?: boolean; delay?: number; t: ReturnType<typeof useTranslations> }) {
  const hasSplit = big && (pool.apyBase > 0 || pool.apyReward > 0);
  return (
    <div className={`${styles.apyWrap} ${big ? styles.apyBig : ""}`}>
      <span className={`mono ${styles.apyVal}`}>
        <CountUpApy value={pool.apy} delay={delay} />
      </span>
      <span className={styles.apyLabel}>{t("apyTotal")}</span>
      {hasSplit && (
        <span className={`mono ${styles.apySplit}`}>
          <span className={styles.apyBase}>{t("base")} {fmtApy(pool.apyBase)}</span>
          {pool.apyReward > 0 && (
            <span className={styles.apyReward}>+{t("reward")} {fmtApy(pool.apyReward)}</span>
          )}
        </span>
      )}
    </div>
  );
}

/** 7-day APY trend: ↗ up / ↘ down + signed %. null source → muted dash. */
function Trend7d({ pct, t }: { pct: number | null; t: ReturnType<typeof useTranslations> }) {
  if (pct == null || !Number.isFinite(pct)) {
    return <span className={`mono ${styles.trendNull}`}>{t("trend7d")} —</span>;
  }
  const up = pct >= 0;
  return (
    <span className={`mono ${styles.trend} ${up ? styles.trendUp : styles.trendDown}`}>
      <span aria-hidden>{up ? "↗" : "↘"}</span>
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

/* The whole card is clickable, but the click target is a *stretched* overlay
   anchor (`.stretch`) rather than wrapping the content. This keeps the HTML
   valid (no <button>/<a> nested inside an <a>) so the in-card InfoTip stays
   independently interactive — it sits above the overlay via z-index. */
function HeroPool({ pool, t, showChain }: { pool: YieldPool; t: ReturnType<typeof useTranslations>; showChain: boolean }) {
  return (
    <div className={`dr-panel dr-enter ${styles.hero}`} style={{ "--i": 1 } as CSSProperties}>
      {/* Ambient gloss sweep — a faint diagonal highlight that crosses the hero
          periodically (long pause between passes), purely decorative & behind
          content. transform-only → GPU. Killed under reduced-motion. */}
      <span className={styles.heroSweep} aria-hidden />
      <a
        href={siteUrl(pool)}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.stretch}
        aria-label={`${pool.project} ${pool.symbol} — ${t("open")}`}
      />
      <span className={styles.heroTag}>
        ★ {t("topRated")}
        <InfoTip label={t("topRatedHint")} />
      </span>
      <div className={styles.heroMain}>
        <div className={styles.heroId}>
          <span className={styles.projectLine}>
            <span className={styles.project}>{pool.project}</span>
            {showChain && <ChainBadge chain={pool.chain} />}
          </span>
          <span className={`mono ${styles.symbol}`}>{pool.symbol}</span>
          <RiskBadges pool={pool} t={t} />
        </div>
        <ApyBlock pool={pool} big delay={0} t={t} />
      </div>
      <div className={styles.heroStats}>
        <span className={`mono ${styles.stat}`}>
          <span className={styles.statLabel}>{t("tvl")}</span>
          {formatUsd(pool.tvlUsd) || "—"}
        </span>
        <Trend7d pct={pool.apyPct7D} t={t} />
        {/* Secondary research link — always DefiLlama. Sits above the stretched
            overlay (z-index) so it's independently clickable. */}
        <a
          href={pool.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.heroOpen}
          onClick={(e) => e.stopPropagation()}
        >
          {t("researchLink")}
        </a>
      </div>
    </div>
  );
}

function PoolRow({
  pool,
  rank,
  delay,
  t,
  showChain,
}: {
  pool: YieldPool;
  rank: number;
  delay: number;
  t: ReturnType<typeof useTranslations>;
  showChain: boolean;
}) {
  return (
    <li className={styles.item} style={{ animationDelay: `${delay}s` }}>
      <div className={styles.rowLink}>
        <a
          href={siteUrl(pool)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.stretch}
          aria-label={`${pool.project} ${pool.symbol} — ${t("open")}`}
        />
        <span className={`mono ${styles.rank}`}>{String(rank).padStart(2, "0")}</span>
        <div className={styles.rowId}>
          <span className={styles.projectLine}>
            <span className={styles.project}>{pool.project}</span>
            {showChain && <ChainBadge chain={pool.chain} />}
          </span>
          <span className={`mono ${styles.symbol}`}>{pool.symbol}</span>
          {/* Always-visible research link → DefiLlama. Raised above the stretched
              overlay so it stays clickable while the row click opens the site. */}
          <a
            href={pool.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`mono ${styles.research}`}
            onClick={(e) => e.stopPropagation()}
          >
            {t("researchLink")}
          </a>
        </div>
        <span className={styles.rowFlags}>
          <RiskBadges pool={pool} t={t} />
        </span>
        <span className={`mono ${styles.rowTvl}`}>{formatUsd(pool.tvlUsd) || "—"}</span>
        <span className={styles.rowTrend}>
          <Trend7d pct={pool.apyPct7D} t={t} />
        </span>
        <ApyBlock pool={pool} delay={delay} t={t} />
      </div>
    </li>
  );
}

/** Full legal disclaimer in a centered glass sheet. Closes on Esc + backdrop
 *  click (universal close rule). Body scroll is left as-is — the sheet scrolls. */
function LegalSheet({ t, onClose }: { t: ReturnType<typeof useTranslations>; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div
        className={`dr-panel ${styles.sheet}`}
        role="dialog"
        aria-modal="true"
        aria-label={t("legalTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.sheetHead}>
          <span className="dr-eyebrow">{t("legalTitle")}</span>
          <button className={styles.sheetClose} onClick={onClose} aria-label={t("legalClose")}>
            ✕
          </button>
        </div>
        <div className={styles.sheetBody}>
          <p>{t("legal1")}</p>
          <p>{t("legal2")}</p>
          <p>{t("legal3")}</p>
          <p>{t("legal4")}</p>
        </div>
      </div>
    </div>
  );
}

function YieldsSkeleton() {
  const t = useTranslations("yields");
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">{t("scanning")}</span>
        <span className="dr-cursor" />
      </div>
      <div className={`${styles.skRow} ${styles.skHero}`} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.skRow} style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

export default function Yields() {
  return (
    <Suspense fallback={null}>
      <YieldsInner />
    </Suspense>
  );
}

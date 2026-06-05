"use client";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useMessages } from "next-intl";
import { isAddress } from "viem";
import type { QuestsResult, ProtocolCategory } from "@/lib/types";
import { questLabel } from "@/i18n/config";

/**
 * Quest id → protocol family, mirroring the `category` field in lib/quests.ts
 * (which is NOT carried on the /api/quests payload). UI-only lookup so we can
 * render the per-quest category tag and the diversity band. Quests without a
 * family (hold-usdc, deploy-contract, active-30-days) are intentionally absent.
 * FALLBACK ONLY: the API payload now carries `category` per quest (single
 * source of truth = lib/quests.ts); this map covers stale v1 payloads cached
 * without it. Removable once the transition window is long past.
 */
const QUEST_CATEGORY: Record<string, ProtocolCategory> = {
  "swap-aerodrome": "DEX",
  "swap-uniswap": "DEX",
  "swap-pancakeswap": "DEX",
  "lend-moonwell": "Lending",
  "supply-aave": "Lending",
  "lend-morpho": "Lending",
  "lend-compound": "Lending",
  "yield-pendle": "Lending",
  "leverage-extra": "Lending",
  "perps-avantis": "Perps",
  "basename": "Identity",
  "smart-wallet": "Identity",
  "bridge-canonical": "Bridge",
  "mint-nft": "NFT",
  "trade-opensea": "NFT",
  "talent-builder-score": "Social",
};

/** Display order of the 7 families in the diversity band. */
const CATEGORY_ORDER: ProtocolCategory[] = [
  "DEX",
  "Lending",
  "Perps",
  "Identity",
  "Bridge",
  "NFT",
  "Social",
];

const BRIDGE_QUEST_ID = "bridge-canonical";
import Counter from "../_components/Counter";
import { shortAddr } from "../_components/presentation";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import styles from "./radar.module.css";

function RadarInner() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("radar");
  const tc = useTranslations("common");
  const messages = useMessages() as { quests?: Record<string, string> };
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";
  const valid = isAddress(address);

  const [data, setData] = useState<QuestsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!address || !valid) return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/quests/${address}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
  }, [address, valid, reload]);

  const doneCount = data ? data.quests.filter((q) => q.done).length : 0;
  const pct = data ? Math.round((data.earned / data.total) * 100) : 0;

  // Animate the progress fill from 0 → pct on mount: paint at 0 first, then
  // flip to pct next frame so the existing `transition: width` plays. Snaps
  // straight to pct under reduced motion.
  const [fillPct, setFillPct] = useState(0);
  useEffect(() => {
    if (!data) {
      setFillPct(0);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setFillPct(pct);
      return;
    }
    const id = requestAnimationFrame(() => setFillPct(pct));
    return () => cancelAnimationFrame(id);
  }, [data, pct]);

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell dr-wide`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <Link href={`/menu${qs}`} className={styles.back} aria-label={tc("back")}>
            ← <span className={styles.backLabel}>MENU</span>
          </Link>
          <span className="dr-eyebrow">{t("questRadar")}</span>
          <LocaleSwitcher />
        </header>

        {!valid && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("invalidTarget")}</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => router.replace("/")}>
              {tc("newScan")}
            </button>
          </div>
        )}

        {valid && error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("offline")}</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => setReload((n) => n + 1)}>
              {tc("retry")}
            </button>
          </div>
        )}

        {valid && !data && !error && <RadarSkeleton />}

        {valid && data && (
          <>
            <p className={`mono dr-enter ${styles.target}`} style={{ "--i": 1 } as CSSProperties}>{shortAddr(address)}</p>

            <section className={`dr-enter ${styles.progress}`} style={{ "--i": 2 } as CSSProperties}>
              <div className={styles.progressTop}>
                <span>
                  <Counter value={data.earned} className={styles.big} duration={1100} />
                  <span className={styles.total}>{t("pts", { total: data.total })}</span>
                </span>
                <span className={styles.completed}>
                  <Counter value={doneCount} duration={900} />
                  <span className="syn-punct">/{data.quests.length}</span> {t("done")}
                </span>
              </div>
              <div className={styles.track}>
                <i style={{ width: `${fillPct}%` }} />
              </div>
            </section>

            {data.categoriesTouched && (
              <section
                className={`dr-enter ${styles.diversity}`}
                style={{ "--i": 3 } as CSSProperties}
              >
                <span className={`mono ${styles.diversityTitle}`}>
                  {t("diversityTitle", { count: data.categoriesTouched.length })}
                </span>
                <div className={styles.pills}>
                  {CATEGORY_ORDER.map((cat) => {
                    const on = data.categoriesTouched!.includes(cat);
                    return (
                      <span
                        key={cat}
                        className={`mono ${styles.pill} ${on ? styles.pillOn : ""}`}
                      >
                        {t(`cat.${cat}`)}
                      </span>
                    );
                  })}
                </div>
                <span className={`mono ${styles.diversityNote}`}>
                  {t("diversityNote")}
                </span>
              </section>
            )}

            <ul className={`dr-enter ${styles.list}`} style={{ "--i": 4 } as CSSProperties}>
              {data.quests.map((q, i) => {
                const link = q.link;
                const cat = q.category ?? QUEST_CATEGORY[q.id];
                return (
                  <li
                    key={q.id}
                    className={`${styles.quest} ${q.done ? styles.questDone : ""}`}
                    style={
                      {
                        animationDelay: `${i * 0.04}s`,
                        "--check-delay": `${i * 0.04 + 0.18}s`,
                      } as CSSProperties
                    }
                  >
                    <span className={styles.check} aria-hidden>
                      {q.done ? "✓" : "○"}
                    </span>
                    <span className={styles.qLabel}>
                      <span className={styles.qLabelText}>
                        {questLabel(q.id, q.label, messages.quests)}
                      </span>
                      {cat && (
                        <span className={`mono ${styles.qTag}`}>{t(`cat.${cat}`)}</span>
                      )}
                    </span>
                    {!q.done && link ? (
                      <a
                        className={styles.qLink}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {tc("doIt")}
                      </a>
                    ) : (
                      <span className={styles.qStatus}>
                        {q.done ? t("cleared") : t("dash")}
                      </span>
                    )}
                    <span className={`mono ${styles.qPts}`}>
                      +{q.points}
                      {q.id === BRIDGE_QUEST_ID && (
                        <span className={styles.qBonus}>{t("bridgeBonus")}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            <section
              className={`dr-enter ${styles.programs}`}
              style={{ "--i": 5 } as CSSProperties}
            >
              <span className="dr-eyebrow">{t("programs")}</span>
              <span className={`mono ${styles.programsNote}`}>
                {t("programsNote")}
              </span>
              <div className={styles.programLinks}>
                <a className={styles.programLink} href="https://guild.xyz/base" target="_blank" rel="noopener noreferrer">
                  Base Guild ↗
                </a>
                <a className={styles.programLink} href="https://www.builderscore.xyz" target="_blank" rel="noopener noreferrer">
                  Builder Rewards ↗
                </a>
                <a className={styles.programLink} href="https://www.base.org/onchain-summer" target="_blank" rel="noopener noreferrer">
                  Onchain Summer ↗
                </a>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function RadarSkeleton() {
  const t = useTranslations("radar");
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">{t("pinging")}</span>
        <span className="dr-cursor" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={styles.skRow} style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

export default function Radar() {
  return (
    <Suspense fallback={null}>
      <RadarInner />
    </Suspense>
  );
}

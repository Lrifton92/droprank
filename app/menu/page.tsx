"use client";
import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { shortAddr } from "../_components/presentation";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import BaseBanner from "../_components/BaseBanner";
import styles from "./menu.module.css";

function MenuInner() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("menu");
  const tc = useTranslations("common");
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell ${styles.wide}`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <button
            className={styles.back}
            onClick={() => router.replace("/")}
            aria-label={tc("back")}
          >
            ←
          </button>
          <span className="dr-brand">
            Drop<span className="dot">·</span>Rank
          </span>
          <LocaleSwitcher />
        </header>

        <div className={`dr-enter ${styles.target}`} style={{ "--i": 1 } as CSSProperties}>
          <span className="dr-eyebrow">{tc("activeTarget")}</span>
          <span className={`mono ${styles.addr}`}>{shortAddr(address)}</span>
        </div>

        <nav className={styles.grid}>
          <Link href={`/score${qs}`} className={`dr-panel dr-enter ${styles.card}`} style={{ "--i": 2 } as CSSProperties}>
            <span className={styles.idx}>01</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M3 18l5-6 4 4 6-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className={styles.cardTitle}>{t("score.title")}</span>
            <span className={styles.cardSub}>{t("score.sub")}</span>
            <span className={styles.arrow}>→</span>
          </Link>

          <Link href={`/radar${qs}`} className={`dr-panel dr-enter ${styles.card}`} style={{ "--i": 3 } as CSSProperties}>
            <span className={styles.idx}>02</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" opacity="0.45" />
                <path d="M12 12L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.cardTitle}>{t("radar.title")}</span>
            <span className={styles.cardSub}>{t("radar.sub")}</span>
            <span className={styles.arrow}>→</span>
          </Link>

          <Link href={`/news${qs}`} className={`dr-panel dr-enter ${styles.card}`} style={{ "--i": 4 } as CSSProperties}>
            <span className={styles.idx}>03</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M4 14a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
                <path d="M7 17a5 5 0 0 1 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
                <circle cx="9" cy="19" r="1.6" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.cardTitle}>{t("news.title")}</span>
            <span className={styles.cardSub}>{t("news.sub")}</span>
            <span className={styles.arrow}>→</span>
          </Link>

          <Link href={`/discover${qs}`} className={`dr-panel dr-enter ${styles.card}`} style={{ "--i": 5 } as CSSProperties}>
            <span className={styles.idx}>04</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5 12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="18.5" cy="18.5" r="1.4" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.cardTitle}>{t("discover.title")}</span>
            <span className={styles.cardSub}>{t("discover.sub")}</span>
            <span className={styles.arrow}>→</span>
          </Link>
        </nav>

        <div className="dr-enter" style={{ "--i": 6 } as CSSProperties}>
          <BaseBanner />
        </div>

        <div className={`dr-term dr-enter ${styles.hint}`} style={{ "--i": 7 } as CSSProperties}>
          <div className="dr-term__bar">
            <i className="dr-term__dot" />
            <i className="dr-term__dot" />
            <i className="dr-term__dot" />
            <span className="dr-term__title">{t("term.title")}</span>
          </div>
          <div className="dr-term__body">
            <div className="dr-term__row">
              <span className="syn-key">{t("term.chain")}</span>
              <span className="syn-str">{t("term.chainValue")}</span>
            </div>
            <div className="dr-term__row">
              <span className="syn-key">{t("term.mode")}</span>
              <span className="syn-str">{t("term.modeValue")}</span>
            </div>
            <div className="dr-term__row">
              <span className="syn-key">{t("term.badge")}</span>
              <span className="syn-str">{t("term.badgeValue")}</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default function Menu() {
  return (
    <Suspense fallback={null}>
      <MenuInner />
    </Suspense>
  );
}

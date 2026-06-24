"use client";
import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { shortAddr } from "../_components/presentation";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import BaseBanner from "../_components/BaseBanner";
import BasenameCard from "../_components/BasenameCard";
import BrandLogo from "../_components/BrandLogo";
import WalletDashboard from "../_components/WalletDashboard";
import AllocationEstimate from "../_components/AllocationEstimate";
import RecentActivity from "./RecentActivity";
import SessionTicker from "./SessionTicker";
import styles from "./menu.module.css";

/* Card arrow: a single SVG — chevron head at rest, the shaft draws in on
   card hover (origin at the head, grows leftward) while the whole arrow
   slides right. One element, nothing can overlap the glyph. */
function CardArrow() {
  return (
    <span className={styles.arrow} aria-hidden>
      <svg viewBox="0 0 20 12" width="20" height="12" fill="none">
        <path
          className={styles.arrowShaft}
          d="M2 6h14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12.5 1.5 17 6l-4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

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
      <main className={`dr-shell dr-wide`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <button
            className={styles.back}
            onClick={() => router.replace("/")}
            aria-label={tc("back")}
          >
            {/* Mirrored CardArrow: chevron at rest, shaft draws toward the
                label on hover while the arrow nudges left. */}
            <span className={styles.backArrow} aria-hidden>
              <svg viewBox="0 0 20 12" width="16" height="10" fill="none">
                <path
                  className={styles.backShaft}
                  d="M4 6h14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M7.5 1.5 3 6l4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.backLabel}>WALLET</span>
          </button>
          <BrandLogo />
          <LocaleSwitcher />
        </header>

        <div className={`dr-enter ${styles.target}`} style={{ "--i": 1 } as CSSProperties}>
          <span className="dr-eyebrow">{tc("activeTarget")}</span>
          <span className={styles.addrRow}>
            <span className={`mono ${styles.addr}`}>{shortAddr(address)}</span>
            {/* Practical-info ticker fills the gap and fades out before LIVE. */}
            <SessionTicker address={address} />
            {/* "LIVE" universel, pas de clé i18n nécessaire */}
            <span className={`mono ${styles.liveBadge}`} aria-hidden>
              <i className={styles.liveDot} />
              LIVE
            </span>
          </span>
          <button
            className={`dr-btn dr-btn--ghost ${styles.scanBtn}`}
            onClick={() => router.replace("/")}
          >
            {tc("scanOther")}
          </button>
        </div>

        <div className="dr-enter" style={{ "--i": 2 } as CSSProperties}>
          <BasenameCard address={address} />
        </div>

        <div className="dr-enter" style={{ "--i": 3 } as CSSProperties}>
          <AllocationEstimate address={address} />
        </div>

        <nav className={styles.grid}>
          <Link href={`/score${qs}`} className={`dr-panel dr-enter ${styles.card}`} style={{ "--i": 4 } as CSSProperties}>
            <span className={styles.idx}>01</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M3 18l5-6 4 4 6-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className={styles.cardTitle}>{t("score.title")}</span>
            <span className={styles.cardSub}>{t("score.sub")}</span>
            <CardArrow />
          </Link>

          <Link href={`/radar${qs}`} className={`dr-panel dr-enter ${styles.card}`} style={{ "--i": 5 } as CSSProperties}>
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
            <CardArrow />
          </Link>

          <Link href={`/news${qs}`} className={`dr-panel dr-enter ${styles.card}`} style={{ "--i": 6 } as CSSProperties}>
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
            <CardArrow />
          </Link>

          <Link href={`/discover${qs}`} className={`dr-panel dr-enter ${styles.card}`} style={{ "--i": 7 } as CSSProperties}>
            <span className={styles.idx}>04</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5 12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="18.5" cy="18.5" r="1.4" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.cardTitle}>{t("discover.title")}</span>
            <span className={styles.cardSub}>{t("discover.sub")}</span>
            <CardArrow />
          </Link>

          {/* 5th card. With 2 cols (md) and 4 cols (xl) it would dangle alone on a
              new row; `cardWide` spans the full row instead so it reads as an
              intentional feature strip, never an orphan. <768px = full-width too. */}
          <Link href={`/yields${qs}`} className={`dr-panel dr-enter ${styles.card} ${styles.cardWide}`} style={{ "--i": 8 } as CSSProperties}>
            <span className={styles.idx}>05</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M4 17l4-5 3 3 5-7 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 21h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
              </svg>
            </span>
            <span className={styles.cardTitle}>{t("yield.title")}</span>
            <span className={styles.cardSub}>{t("yield.sub")}</span>
            <CardArrow />
          </Link>
        </nav>

        <div className="dr-enter" style={{ "--i": 9 } as CSSProperties}>
          <WalletDashboard address={address} />
        </div>

        <div className="dr-enter" style={{ "--i": 10 } as CSSProperties}>
          <RecentActivity address={address} />
        </div>

        <div className="dr-enter" style={{ "--i": 11 } as CSSProperties}>
          <BaseBanner />
        </div>

        <div className={`dr-term dr-enter ${styles.hint} ${styles.term}`} style={{ "--i": 12 } as CSSProperties}>
          <div className="dr-term__bar">
            <i className="dr-term__dot" />
            <i className="dr-term__dot" />
            <i className="dr-term__dot" />
            <span className="dr-term__title">{t("term.title")}</span>
          </div>
          <div className="dr-term__body">
            <div className={`dr-term__row ${styles.termRow}`} style={{ "--row": 0 } as CSSProperties}>
              <span className="syn-key">{t("term.chain")}</span>
              <span className={`syn-str ${styles.termVal}`}>{t("term.chainValue")}</span>
            </div>
            <div className={`dr-term__row ${styles.termRow}`} style={{ "--row": 1 } as CSSProperties}>
              <span className="syn-key">{t("term.mode")}</span>
              <span className={`syn-str ${styles.termVal}`}>{t("term.modeValue")}</span>
            </div>
            <div className={`dr-term__row ${styles.termRow}`} style={{ "--row": 2 } as CSSProperties}>
              <span className="syn-key">{t("term.badge")}</span>
              <span className={`syn-str ${styles.termVal}`}>{t("term.badgeValue")}</span>
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

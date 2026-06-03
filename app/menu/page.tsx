"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { shortAddr } from "../_components/presentation";
import styles from "./menu.module.css";

function MenuInner() {
  const router = useRouter();
  const params = useSearchParams();
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  return (
    <>
      <div className="dr-grid-bg" />
      <main className="dr-shell">
        <header className={styles.head}>
          <button
            className={styles.back}
            onClick={() => router.replace("/")}
            aria-label="Back"
          >
            ←
          </button>
          <span className="dr-brand">
            Drop<span className="dot">·</span>Rank
          </span>
          <span />
        </header>

        <div className={styles.target}>
          <span className="dr-eyebrow">{"// active target"}</span>
          <span className={`mono ${styles.addr}`}>{shortAddr(address)}</span>
        </div>

        <nav className={styles.grid}>
          <Link href={`/score${qs}`} className={`dr-panel ${styles.card}`}>
            <span className={styles.idx}>01</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M3 18l5-6 4 4 6-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className={styles.cardTitle}>SCORE</span>
            <span className={styles.cardSub}>your /100 rank, breakdown &amp; tier</span>
            <span className={styles.arrow}>→</span>
          </Link>

          <Link href={`/radar${qs}`} className={`dr-panel ${styles.card}`}>
            <span className={styles.idx}>02</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" opacity="0.45" />
                <path d="M12 12L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.cardTitle}>RADAR</span>
            <span className={styles.cardSub}>12 onchain quests &amp; progress</span>
            <span className={styles.arrow}>→</span>
          </Link>

          <Link href={`/news${qs}`} className={`dr-panel ${styles.card}`}>
            <span className={styles.idx}>03</span>
            <span className={styles.glyph} aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M4 14a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
                <path d="M7 17a5 5 0 0 1 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
                <circle cx="9" cy="19" r="1.6" fill="currentColor" />
              </svg>
            </span>
            <span className={styles.cardTitle}>NEWS</span>
            <span className={styles.cardSub}>latest base ecosystem signals</span>
            <span className={styles.arrow}>→</span>
          </Link>
        </nav>

        <div className={`dr-term ${styles.hint}`}>
          <div className="dr-term__bar">
            <i className="dr-term__dot" />
            <i className="dr-term__dot" />
            <i className="dr-term__dot" />
            <span className="dr-term__title">droprank://session</span>
          </div>
          <div className="dr-term__body">
            <div className="dr-term__row">
              <span className="syn-key">chain</span>
              <span className="syn-str">&quot;base-mainnet&quot;</span>
            </div>
            <div className="dr-term__row">
              <span className="syn-key">mode</span>
              <span className="syn-str">&quot;read-only&quot;</span>
            </div>
            <div className="dr-term__row">
              <span className="syn-key">badge</span>
              <span className="syn-str">&quot;soulbound · 1/address&quot;</span>
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

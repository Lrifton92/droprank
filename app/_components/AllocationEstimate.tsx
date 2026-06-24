"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { ScoreResult } from "@/lib/types";
import { estimateAllocation } from "@/lib/allocation";
import styles from "./AllocationEstimate.module.css";

const REDUCE = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Ring geometry (viewBox 200x200, r=86). */
const RADIUS = 86;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * Eased 0→1 reveal that starts once `active` flips true. Drives the ring sweep
 * and the figure count-up from one clock. Snaps to 1 under reduced-motion.
 */
function useReveal(active: boolean, duration = 1150): number {
  const [p, setP] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      setP(0);
      return;
    }
    if (REDUCE()) {
      setP(1);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const x = Math.min(1, (now - t0) / duration);
      setP(x === 1 ? 1 : 1 - Math.pow(2, -10 * x));
      if (x < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [active, duration]);
  return p;
}

/**
 * Speculative Base airdrop allocation block on the menu hub. Pulls the same
 * cached /api/score endpoint as the dashboard (no new data path) and runs the
 * pure estimateAllocation heuristic on score + percentile. The figure sits at
 * the centre of an animated blue ring that fills to the wallet's score, tying
 * the estimate visually to what drives it. Always framed as speculative — Base
 * has no confirmed airdrop.
 */
export default function AllocationEstimate({ address }: { address: string }) {
  const t = useTranslations("allocation");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const [score, setScore] = useState<ScoreResult | null>(null);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    setScore(null);
    fetch(`/api/score/${address}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setScore(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [address]);

  const est = score ? estimateAllocation(score.score, score.percentile) : null;
  const eligible = est?.eligible === true;
  const p = useReveal(eligible);

  // Ring fills to score/100; figures roll up from 0 — both off the same clock.
  const frac = eligible && score ? score.score / 100 : 0;
  const offset = CIRC * (1 - frac * p);
  const lowN = est ? Math.round(est.low * p) : 0;
  const highN = est ? Math.round(est.high * p) : 0;

  return (
    <section className={`dr-panel ${styles.alloc}`} aria-label={t("title")}>
      {!est ? (
        <>
          <span className={`dr-eyebrow ${styles.head}`}>{t("title")}</span>
          <span className={styles.loading}>{t("loading")}</span>
        </>
      ) : eligible ? (
        <div className={styles.row}>
          <div className={styles.copy}>
            <span className={`dr-eyebrow ${styles.head}`}>{t("title")}</span>
            <span className={styles.label}>{t("rangeLabel")}</span>
            {score && (
              <span className={styles.basis}>
                {t("basis", { score: score.score })}
              </span>
            )}
            <span className={styles.method}>{t("method")}</span>
            <span className={styles.disclaimer}>{t("speculative")}</span>
          </div>

          <div className={styles.ringWrap}>
            <span className={styles.halo} aria-hidden />
            <svg className={styles.ring} viewBox="0 0 200 200" aria-hidden>
              <defs>
                <linearGradient id="alloc-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--base-200)" />
                  <stop offset="55%" stopColor="var(--base-300)" />
                  <stop offset="100%" stopColor="var(--base)" />
                </linearGradient>
              </defs>
              <circle className={styles.track} cx="100" cy="100" r={RADIUS} />
              <circle
                className={styles.prog}
                cx="100"
                cy="100"
                r={RADIUS}
                strokeDasharray={CIRC}
                strokeDashoffset={offset}
              />
            </svg>
            <div className={styles.center}>
              <span className={styles.low}>
                <span className={styles.cur}>$</span>
                {nf.format(lowN)}
              </span>
              <span className={styles.dash} aria-hidden />
              <span className={styles.high}>
                <span className={styles.cur}>$</span>
                {nf.format(highN)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <span className={`dr-eyebrow ${styles.head}`}>{t("title")}</span>
          <span className={styles.below}>{t("belowThreshold")}</span>
          <span className={styles.label}>{t("belowThresholdSub")}</span>
          <span className={styles.disclaimer}>{t("speculative")}</span>
        </>
      )}
    </section>
  );
}

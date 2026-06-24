"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { ScoreResult } from "@/lib/types";
import { estimateAllocation } from "@/lib/allocation";
import { tierFor } from "../_components/presentation";
import styles from "./AirdropHero.module.css";

const REDUCE = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useCountUp(value: number | null, duration = 1100): number {
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (value === null) return;
    if (REDUCE()) {
      setN(value);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setN(Math.round(value * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);
  return n;
}

/**
 * Airdrop hero — the dashboard now opens on the thing that matters: the money.
 * A cinematic deep-Base-blue band leads with the estimated allocation (giant,
 * count-up), framed by the score, tier and rank. Pulls the cached /api/score.
 */
export default function AirdropHero({ address }: { address: string }) {
  const t = useTranslations("allocation");
  const ts = useTranslations("score");
  const td = useTranslations("dashboard");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const [data, setData] = useState<ScoreResult | null>(null);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    setData(null);
    fetch(`/api/score/${address}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [address]);

  const est = data ? estimateAllocation(data.score, data.percentile) : null;
  const tier = data ? tierFor(data.score) : null;
  const topPct =
    typeof data?.percentile === "number" ? 100 - data.percentile : null;
  const p = useCountUp(est?.eligible ? 1 : null);
  const lowN = est ? Math.round(est.low * p) : 0;
  const highN = est ? Math.round(est.high * p) : 0;
  const scoreN = useCountUp(data ? data.score : null);

  return (
    <section
      className={styles.hero}
      style={tier ? ({ "--tier": tier.color } as CSSProperties) : undefined}
      aria-label={t("title")}
    >
      <span className={styles.aura} aria-hidden />
      <span className={styles.eyebrow}>{t("title")}</span>

      {est?.eligible ? (
        <div className={styles.amount}>
          <span className={styles.cur}>$</span>
          {nf.format(lowN)}
          <span className={styles.dash}>–</span>
          <span className={styles.cur}>$</span>
          {nf.format(highN)}
        </div>
      ) : (
        <div className={styles.amount}>{data ? "—" : "··"}</div>
      )}

      <span className={styles.method}>{t("method")}</span>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{td("score")}</span>
          <span className={styles.statVal}>
            {data ? scoreN : "··"}
            <small>/100</small>
          </span>
          {tier && (
            <span className={styles.tier}>
              <i className={styles.tierDot} aria-hidden />
              {tier.name}
            </span>
          )}
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{td("rank")}</span>
          <span className={styles.statVal}>
            {topPct !== null ? ts("topPercent", { pct: topPct }) : "··"}
          </span>
        </div>
      </div>

      <span className={styles.note}>{t("speculative")}</span>
    </section>
  );
}

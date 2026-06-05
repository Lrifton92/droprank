"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ScoreResult } from "@/lib/types";
import { parseDetail } from "@/i18n/config";
import { tierFor } from "../_components/presentation";
import styles from "./SessionTicker.module.css";

/**
 * Horizontal info ticker that fills the empty space on the active-target row,
 * stopping cleanly just before the LIVE badge (the row's flex layout caps its
 * width; a fade mask on both ends keeps it from ever touching the badge).
 *
 * Data comes from /api/score/<address> (same endpoint BasenameCard already
 * hits — server-cached 5 min, so the extra fetch is cheap). It stays silent
 * until data lands (no skeleton flicker) and disappears on any fetch error.
 * <768px the row has no spare room, so the CSS hides the whole strip.
 */
export default function SessionTicker({ address }: { address: string }) {
  const t = useTranslations("ticker");
  const [data, setData] = useState<ScoreResult | null>(null);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    setData(null);
    fetch(`/api/score/${address}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ScoreResult | null) => d && setData(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [address]);

  if (!data) return null;

  // Pull structured values back out of the (EN) breakdown details via the
  // existing pure parser — no new parsing logic, no scoring.ts changes.
  const find = (key: string) => data.breakdown.find((b) => b.key === key);
  const detailNum = (key: string, field: "count" | "value" | "earned") => {
    const b = find(key);
    if (!b) return null;
    const d = parseDetail(b.key, b.detail);
    const v = d?.values?.[field];
    return v ?? null;
  };

  const tier = tierFor(data.score);
  const tx = detailNum("txCount", "count");
  const months = detailNum("activeMonths", "count");
  const vol = detailNum("volumeEth", "value");
  const quests = detailNum("quests", "earned");

  // Each item: a dim label + an accent value. Only include what's available so
  // a fresh wallet doesn't show a wall of zeros it never earned.
  const items: { label: string; value: string }[] = [
    { label: t("score"), value: `${data.score}/100 ${tier.name}` },
  ];
  if (typeof data.percentile === "number" && data.percentile > 0)
    items.push({ label: t("percentile"), value: t("topPct", { pct: 100 - data.percentile }) });
  if (tx !== null) items.push({ label: t("txs"), value: String(tx) });
  if (months !== null) items.push({ label: t("active"), value: t("months", { count: Number(months) }) });
  if (vol !== null && Number(vol) > 0) items.push({ label: t("volume"), value: `${vol} ETH` });
  if (quests !== null) items.push({ label: t("quests"), value: `${quests} pts` });

  // Duplicate the run so the marquee loops seamlessly (translateX -50%).
  const run = (k: string) =>
    items.map((it, i) => (
      <span className={styles.item} key={`${k}-${i}`}>
        <span className={styles.label}>{it.label}</span>
        <span className={styles.value}>{it.value}</span>
        <span className={styles.sep} aria-hidden>
          //
        </span>
      </span>
    ));

  // Rendered as spans (not divs): this sits inside the `.addrRow` <span>, so
  // block-level children would be invalid markup. flex items work on spans.
  return (
    <span className={`mono ${styles.wrap}`} aria-hidden>
      <span className={styles.track}>
        <span className={styles.run}>{run("a")}</span>
        <span className={styles.run}>{run("b")}</span>
      </span>
    </span>
  );
}

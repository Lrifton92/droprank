"use client";
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ScoreResult, QuestsResult } from "@/lib/types";
import { tierFor, improveFor } from "./presentation";
import styles from "./WalletDashboard.module.css";

/**
 * Wallet tuning dashboard, shown on the menu hub right under the identity card.
 * A single at-a-glance read of the wallet: score + tier, rank (percentile),
 * tasks completed, and the biggest remaining levers (deduped by the action that
 * fixes them). Pulls from the existing /api/score + /api/quests endpoints (both
 * cached), so it adds no new data path.
 */
export default function WalletDashboard({ address }: { address: string }) {
  const td = useTranslations("dashboard");
  const ts = useTranslations("score");
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [quests, setQuests] = useState<QuestsResult | null>(null);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    setScore(null);
    setQuests(null);
    fetch(`/api/score/${address}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setScore(d))
      .catch(() => {});
    fetch(`/api/quests/${address}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setQuests(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [address]);

  const qs = address ? `?address=${address}` : "";
  const tier = score ? tierFor(score.score) : null;
  const topPct =
    typeof score?.percentile === "number" ? 100 - score.percentile : null;
  const tasksDone = quests ? quests.quests.filter((q) => q.done).length : null;
  const tasksTotal = quests ? quests.quests.length : null;
  const tasksPct =
    tasksDone !== null && tasksTotal ? (tasksDone / tasksTotal) * 100 : 0;

  // Biggest remaining levers, deduped by the action that improves them (several
  // breakdown rows share one action — e.g. txCount/volumeEth/contracts → "be
  // active on Base"), summing the points each action would unlock. Top 3.
  type Gain = { key: string; labelKey: string; kind: string; href?: string; gain: number };
  const gains: Gain[] = [];
  if (score) {
    const by = new Map<string, Gain>();
    for (const b of score.breakdown) {
      if (b.points >= b.max) continue;
      const imp = improveFor(b.key);
      const href = "href" in imp ? imp.href : undefined;
      const k = `${imp.kind}:${imp.labelKey}:${href ?? ""}`;
      const cur =
        by.get(k) ?? { key: k, labelKey: imp.labelKey, kind: imp.kind, href, gain: 0 };
      cur.gain += b.max - b.points;
      by.set(k, cur);
    }
    gains.push(...[...by.values()].sort((a, b) => b.gain - a.gain).slice(0, 3));
  }

  const loading = !score || !quests;

  return (
    <section className={`dr-panel ${styles.dash}`} aria-label={td("title")}>
      <span className={`dr-eyebrow ${styles.title}`}>{td("title")}</span>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>{td("score")}</span>
          <span className={styles.tileVal}>
            {score ? score.score : "··"}
            <span className={styles.tileUnit}>/100</span>
          </span>
          {tier && (
            <span
              className={styles.tier}
              style={{ "--tier": tier.color } as CSSProperties}
            >
              {tier.name}
            </span>
          )}
        </div>

        <div className={styles.tile}>
          <span className={styles.tileLabel}>{td("rank")}</span>
          <span className={styles.tileVal}>
            {topPct !== null ? ts("topPercent", { pct: topPct }) : "··"}
          </span>
        </div>

        <div className={styles.tile}>
          <span className={styles.tileLabel}>{td("tasks")}</span>
          <span className={styles.tileVal}>
            {tasksDone !== null ? tasksDone : "··"}
            <span className={styles.tileUnit}>/{tasksTotal ?? 19}</span>
          </span>
          <span className={styles.bar} aria-hidden>
            <i style={{ width: `${tasksPct}%` }} />
          </span>
        </div>
      </div>

      {!loading && gains.length > 0 && (
        <div className={styles.gains}>
          <span className={styles.gainsHead}>{td("nextGains")}</span>
          <ul className={styles.gainsList}>
            {gains.map((g) => (
              <li key={g.key} className={styles.gain}>
                <span className={styles.gainPlus}>+{g.gain}</span>
                {g.kind === "link" && g.href ? (
                  <a
                    className={styles.gainLink}
                    href={g.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {ts(`improve.${g.labelKey}`)} ↗
                  </a>
                ) : g.kind === "radar" ? (
                  <Link className={styles.gainLink} href={`/radar${qs}`}>
                    {ts(`improve.${g.labelKey}`)} →
                  </Link>
                ) : (
                  <span className={styles.gainTime}>
                    ⏳ {ts(`improve.${g.labelKey}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && gains.length === 0 && (
        <div className={styles.gains}>
          <span className={styles.allMaxed}>{td("allMaxed")}</span>
        </div>
      )}
    </section>
  );
}

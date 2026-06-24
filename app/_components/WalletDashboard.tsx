"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ScoreResult, QuestsResult } from "@/lib/types";
import { tierFor, improveFor } from "./presentation";
import styles from "./WalletDashboard.module.css";

const REDUCE = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Count-up that rolls 0 → `value` once `value` becomes a number (i.e. when the
 * async fetch resolves). easeOutExpo, ~900ms. Snaps to final under
 * prefers-reduced-motion. `null` keeps it at 0 (the "··" placeholder is shown
 * by the caller while loading, so 0 is never visible pre-data).
 */
function useCountUp(value: number | null, duration = 900): number {
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (value === null) {
      setN(0);
      return;
    }
    if (REDUCE()) {
      setN(value);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(Math.round(value * eased));
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
 * One stat tile with a pointer-driven 3D parallax tilt. The tile face tilts up
 * to ±7° toward the cursor; the inner content sits on a higher Z plane so it
 * reads as floating above the face. A roaming spotlight tracks the cursor.
 * Touch/reduced-motion never engage the tilt (kept flat & legible).
 */
function Tile({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || REDUCE()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * 14; // tilt up/down, max ±7°
    const ry = (px - 0.5) * 14; // tilt left/right, max ±7°
    el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
    el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  }
  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div
      ref={ref}
      className={styles.tile}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      <span className={styles.tileFace} aria-hidden />
      <span className={styles.tileSheen} aria-hidden />
      <div className={styles.tileInner}>{children}</div>
    </div>
  );
}

/**
 * Wallet tuning dashboard, shown on the menu hub right under the identity card.
 * A single at-a-glance read of the wallet: score + tier, rank (percentile),
 * tasks completed, and the biggest remaining levers (deduped by the action that
 * fixes them). Pulls from the existing /api/score + /api/quests endpoints (both
 * cached), so it adds no new data path.
 */
export default function WalletDashboard({
  address,
  embedded = false,
}: {
  address: string;
  /** When true, render bare (no panel/title/score tile) for nesting inside the
   *  identity card — the card header already carries the score. */
  embedded?: boolean;
}) {
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

  // Animated values — roll up from 0 once their fetch resolves.
  const scoreN = useCountUp(score ? score.score : null);
  const topPctN = useCountUp(topPct);
  const tasksN = useCountUp(tasksDone);

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

  const body = (
    <>
      {!embedded && (
        <span className={`dr-eyebrow ${styles.title}`}>{td("title")}</span>
      )}

      <div className={styles.tiles}>
        {!embedded && (
          <Tile>
            <span className={styles.tileLabel}>{td("score")}</span>
            <span className={styles.tileVal}>
              {score ? scoreN : "··"}
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
          </Tile>
        )}

        {!embedded && (
          <Tile>
            <span className={styles.tileLabel}>{td("rank")}</span>
            <span className={styles.tileVal}>
              {topPct !== null ? ts("topPercent", { pct: topPctN }) : "··"}
            </span>
          </Tile>
        )}

        <Tile>
          <span className={styles.tileLabel}>{td("tasks")}</span>
          <span className={styles.tileVal}>
            {tasksDone !== null ? tasksN : "··"}
            <span className={styles.tileUnit}>/{tasksTotal ?? 19}</span>
          </span>
          <span className={styles.bar} aria-hidden>
            <i style={{ width: `${tasksPct}%` }} />
          </span>
        </Tile>
      </div>

      {!loading && gains.length > 0 && (
        <div className={styles.gains}>
          <span className={styles.gainsHead}>{td("nextGains")}</span>
          <ul className={styles.gainsList}>
            {gains.map((g, i) => (
              <li
                key={g.key}
                className={styles.gain}
                style={{ "--g": i } as CSSProperties}
              >
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
    </>
  );

  if (embedded) return <div className={styles.embed}>{body}</div>;
  return (
    <section className={`dr-panel ${styles.dash}`} aria-label={td("title")}>
      {body}
    </section>
  );
}

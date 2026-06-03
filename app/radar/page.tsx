"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isAddress } from "viem";
import type { QuestsResult } from "@/lib/types";
import Counter from "../_components/Counter";
import { shortAddr } from "../_components/presentation";
import styles from "./radar.module.css";

function RadarInner() {
  const router = useRouter();
  const params = useSearchParams();
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

  return (
    <>
      <div className="dr-grid-bg" />
      <main className="dr-shell">
        <header className={styles.head}>
          <Link href={`/menu${qs}`} className={styles.back} aria-label="Back">
            ←
          </Link>
          <span className="dr-eyebrow">{"// quest radar"}</span>
          <span />
        </header>

        {!valid && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>! INVALID TARGET</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => router.replace("/")}>
              ← New scan
            </button>
          </div>
        )}

        {valid && error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>! RADAR OFFLINE</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => setReload((n) => n + 1)}>
              ↻ Retry
            </button>
          </div>
        )}

        {valid && !data && !error && <RadarSkeleton />}

        {valid && data && (
          <>
            <p className={`mono ${styles.target}`}>{shortAddr(address)}</p>

            <section className={styles.progress}>
              <div className={styles.progressTop}>
                <span>
                  <Counter value={data.earned} className={styles.big} duration={1100} />
                  <span className={styles.total}>/{data.total} pts</span>
                </span>
                <span className={styles.completed}>
                  <span className="mono">{doneCount}</span>
                  <span className="syn-punct">/{data.quests.length}</span> done
                </span>
              </div>
              <div className={styles.track}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </section>

            <ul className={styles.list}>
              {data.quests.map((q, i) => {
                const link = q.link;
                return (
                  <li
                    key={q.id}
                    className={`${styles.quest} ${q.done ? styles.questDone : ""}`}
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <span className={styles.check} aria-hidden>
                      {q.done ? "✓" : "○"}
                    </span>
                    <span className={styles.qLabel}>{q.label}</span>
                    {!q.done && link ? (
                      <a
                        className={styles.qLink}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        do it ↗
                      </a>
                    ) : (
                      <span className={styles.qStatus}>
                        {q.done ? "cleared" : "—"}
                      </span>
                    )}
                    <span className={`mono ${styles.qPts}`}>+{q.points}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </>
  );
}

function RadarSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">PINGING QUEST REGISTRY</span>
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

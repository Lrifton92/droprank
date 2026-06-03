"use client";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isAddress } from "viem";
import type { ScoreResult } from "@/lib/types";
import Counter from "../_components/Counter";
import { tierFor, shortAddr } from "../_components/presentation";
import styles from "./score.module.css";

function ScoreInner() {
  const router = useRouter();
  const params = useSearchParams();
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";
  const valid = isAddress(address);

  const [data, setData] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!address || !valid) return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetch(`/api/score/${address}`, { signal: ctrl.signal })
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

  const tier = data ? tierFor(data.score) : null;
  const empty = data?.score === 0;

  const onShare = async () => {
    const url = `${window.location.origin}/api/og/${address}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My DropRank", url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 1800);
      }
    } catch {
      /* user dismissed */
    }
  };

  return (
    <>
      <div className="dr-grid-bg" />
      <main className="dr-shell">
        <header className={styles.head}>
          <Link href={`/menu${qs}`} className={styles.back} aria-label="Back">
            ←
          </Link>
          <span className="dr-eyebrow">{"// score report"}</span>
          <span />
        </header>

        {!valid && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>! INVALID TARGET</p>
            <p className={styles.stateSub}>
              No valid Base address supplied.
            </p>
            <button className="dr-btn dr-btn--ghost" onClick={() => router.replace("/")}>
              ← New scan
            </button>
          </div>
        )}

        {valid && error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>! SCAN FAILED</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              ↻ Retry scan
            </button>
          </div>
        )}

        {valid && !data && !error && <ScoreSkeleton />}

        {valid && data && tier && (
          <>
            <p className={`mono ${styles.target}`}>{shortAddr(address)}</p>

            <section
              className={`${styles.hero} ${empty ? styles.heroEmpty : ""}`}
              style={{ "--tier": tier.color } as CSSProperties}
            >
              <div className={styles.scoreWrap}>
                <Counter value={data.score} className={styles.score} duration={1400} />
                <span className={styles.scoreMax}>/{data.max}</span>
              </div>
              <div className={styles.tierRow}>
                <span className={styles.tierBadge}>{tier.name}</span>
                <span className={styles.percentile}>
                  percentile{" "}
                  <span className="mono">
                    {typeof data.percentile === "number"
                      ? `top ${100 - data.percentile}%`
                      : "—"}
                  </span>
                </span>
              </div>
              {empty && (
                <p className={styles.startMsg}>
                  Fresh wallet. <strong>START YOUR JOURNEY</strong> — complete
                  quests on the radar to climb the ranks.
                </p>
              )}
            </section>

            <section className={`dr-term ${styles.breakdown}`}>
              <div className="dr-term__bar">
                <i className="dr-term__dot" />
                <i className="dr-term__dot" />
                <i className="dr-term__dot" />
                <span className="dr-term__title">score.breakdown[]</span>
              </div>
              <div className="dr-term__body">
                {data.breakdown.map((b, i) => (
                  <div
                    key={b.key}
                    className={`dr-term__row ${styles.row}`}
                    style={{ animationDelay: `${0.05 * i + 0.2}s` }}
                  >
                    <span className={styles.rowLabel}>
                      <span className="syn-key">{b.key}</span>
                      <span className={styles.detail}>{b.detail}</span>
                    </span>
                    <span className={styles.rowPts}>
                      <span className={styles.bar}>
                        <i
                          style={{
                            width: `${Math.round((b.points / b.max) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="mono">
                        <span className={b.points > 0 ? "syn-num" : "syn-punct"}>
                          {b.points}
                        </span>
                        <span className="syn-punct">/{b.max}</span>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.cta}>
              <button
                className="dr-btn"
                onClick={() => alert("Mint badge — contract wiring coming soon")}
              >
                {empty ? "Mint when ready" : "Mint badge ↗"}
              </button>
              <button className="dr-btn dr-btn--ghost" onClick={onShare}>
                {shared ? "✓ link copied" : "Share rank"}
              </button>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function ScoreSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">SCANNING ONCHAIN ACTIVITY</span>
        <span className="dr-cursor" />
      </div>
      <div className={styles.skScore} />
      <div className={styles.skTerm}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.skRow} style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  );
}

export default function Score() {
  return (
    <Suspense fallback={null}>
      <ScoreInner />
    </Suspense>
  );
}

"use client";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useMessages } from "next-intl";
import { isAddress } from "viem";
import type { QuestsResult } from "@/lib/types";
import { questLabel } from "@/i18n/config";
import Counter from "../_components/Counter";
import { shortAddr } from "../_components/presentation";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import styles from "./radar.module.css";

function RadarInner() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("radar");
  const tc = useTranslations("common");
  const messages = useMessages() as { quests?: Record<string, string> };
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
      <main className={`dr-shell ${styles.wide}`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <Link href={`/menu${qs}`} className={styles.back} aria-label={tc("back")}>
            ←
          </Link>
          <span className="dr-eyebrow">{t("questRadar")}</span>
          <LocaleSwitcher />
        </header>

        {!valid && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("invalidTarget")}</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => router.replace("/")}>
              {tc("newScan")}
            </button>
          </div>
        )}

        {valid && error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("offline")}</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => setReload((n) => n + 1)}>
              {tc("retry")}
            </button>
          </div>
        )}

        {valid && !data && !error && <RadarSkeleton />}

        {valid && data && (
          <>
            <p className={`mono dr-enter ${styles.target}`} style={{ "--i": 1 } as CSSProperties}>{shortAddr(address)}</p>

            <section className={`dr-enter ${styles.progress}`} style={{ "--i": 2 } as CSSProperties}>
              <div className={styles.progressTop}>
                <span>
                  <Counter value={data.earned} className={styles.big} duration={1100} />
                  <span className={styles.total}>{t("pts", { total: data.total })}</span>
                </span>
                <span className={styles.completed}>
                  <span className="mono">{doneCount}</span>
                  <span className="syn-punct">/{data.quests.length}</span> {t("done")}
                </span>
              </div>
              <div className={styles.track}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </section>

            <ul className={`dr-enter ${styles.list}`} style={{ "--i": 3 } as CSSProperties}>
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
                    <span className={styles.qLabel}>
                      {questLabel(q.id, q.label, messages.quests)}
                    </span>
                    {!q.done && link ? (
                      <a
                        className={styles.qLink}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {tc("doIt")}
                      </a>
                    ) : (
                      <span className={styles.qStatus}>
                        {q.done ? t("cleared") : t("dash")}
                      </span>
                    )}
                    <span className={`mono ${styles.qPts}`}>+{q.points}</span>
                  </li>
                );
              })}
            </ul>

            <section
              className={`dr-enter ${styles.programs}`}
              style={{ "--i": 4 } as CSSProperties}
            >
              <span className="dr-eyebrow">{t("programs")}</span>
              <span className={`mono ${styles.programsNote}`}>
                {t("programsNote")}
              </span>
              <div className={styles.programLinks}>
                <a className={styles.programLink} href="https://guild.xyz/base" target="_blank" rel="noopener noreferrer">
                  Base Guild ↗
                </a>
                <a className={styles.programLink} href="https://www.builderscore.xyz" target="_blank" rel="noopener noreferrer">
                  Builder Rewards ↗
                </a>
                <a className={styles.programLink} href="https://www.base.org/onchain-summer" target="_blank" rel="noopener noreferrer">
                  Onchain Summer ↗
                </a>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function RadarSkeleton() {
  const t = useTranslations("radar");
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">{t("pinging")}</span>
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

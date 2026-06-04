"use client";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { isAddress } from "viem";
import type { ScoreResult } from "@/lib/types";
import { parseDetail } from "@/i18n/config";
import Counter from "../_components/Counter";
import { tierFor, shortAddr, improveFor } from "../_components/presentation";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import MintButton from "./MintButton";
import styles from "./score.module.css";

function ScoreInner() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("score");
  const tc = useTranslations("common");
  const td = useTranslations("detail");
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
    const text = data
      ? t("shareScoreText", { score: data.score })
      : t("shareGenericText");
    try {
      if (navigator.share) {
        await navigator.share({ title: t("shareTitle"), text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
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
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <Link href={`/menu${qs}`} className={styles.back} aria-label={tc("back")}>
            ←
          </Link>
          <span className="dr-eyebrow">{t("report")}</span>
          <LocaleSwitcher />
        </header>

        {!valid && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("invalidTarget")}</p>
            <p className={styles.stateSub}>{t("invalidTargetSub")}</p>
            <button className="dr-btn dr-btn--ghost" onClick={() => router.replace("/")}>
              {tc("newScan")}
            </button>
          </div>
        )}

        {valid && error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("scanFailed")}</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              {tc("retryScan")}
            </button>
          </div>
        )}

        {valid && !data && !error && <ScoreSkeleton />}

        {valid && data && tier && (
          <>
            <p className={`mono dr-enter ${styles.target}`} style={{ "--i": 1 } as CSSProperties}>{shortAddr(address)}</p>

            <section
              className={`dr-enter ${styles.hero} ${empty ? styles.heroEmpty : ""}`}
              style={{ "--tier": tier.color, "--i": 2 } as CSSProperties}
            >
              <div className={styles.scoreWrap}>
                <Counter value={data.score} className={styles.score} duration={1400} />
                <span className={styles.scoreMax}>/{data.max}</span>
              </div>
              <div className={styles.tierRow}>
                <span className={styles.tierBadge}>{tier.name}</span>
                <span className={styles.percentile}>
                  {t("percentile")}{" "}
                  <span className="mono">
                    {typeof data.percentile === "number"
                      ? t("topPercent", { pct: 100 - data.percentile })
                      : "—"}
                  </span>
                </span>
              </div>
              {empty && (
                <p className={styles.startMsg}>
                  {t("freshWalletPre")}
                  <strong>{t("startYourJourney")}</strong>
                  {t("freshWalletPost")}
                </p>
              )}
            </section>

            <section className={`dr-term dr-enter ${styles.breakdown}`} style={{ "--i": 3 } as CSSProperties}>
              <div className="dr-term__bar">
                <i className="dr-term__dot" />
                <i className="dr-term__dot" />
                <i className="dr-term__dot" />
                <span className="dr-term__title">{t("breakdownTitle")}</span>
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
                      <span className={styles.detail}>
                        {(() => {
                          const d = parseDetail(b.key, b.detail);
                          return d ? td(d.key, d.values) : b.detail;
                        })()}
                      </span>
                      {b.points < b.max ? (
                        (() => {
                          const imp = improveFor(b.key);
                          return (
                            <span className={styles.improve}>
                              <span className={styles.gain}>+{b.max - b.points}</span>
                              {imp.kind === "link" && (
                                <a
                                  className={styles.improveLink}
                                  href={imp.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {t(`improve.${imp.labelKey}`)} ↗
                                </a>
                              )}
                              {imp.kind === "radar" && (
                                <Link className={styles.improveLink} href={`/radar${qs}`}>
                                  {t(`improve.${imp.labelKey}`)} →
                                </Link>
                              )}
                              {imp.kind === "time" && (
                                <span className={styles.improveTime}>
                                  ⏳ {t("improve.time")}
                                </span>
                              )}
                            </span>
                          );
                        })()
                      ) : (
                        <span className={styles.maxed}>✓ {t("improve.maxed")}</span>
                      )}
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

            <section className={`dr-enter ${styles.cta}`} style={{ "--i": 4 } as CSSProperties}>
              <MintButton scannedAddress={address} empty={empty} />
              <button className="dr-btn dr-btn--ghost" onClick={onShare}>
                {shared ? t("linkCopied") : t("shareRank")}
              </button>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function ScoreSkeleton() {
  const t = useTranslations("score");
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">{t("scanning")}</span>
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

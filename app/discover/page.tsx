"use client";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { timeAgo, formatUsd } from "../_components/presentation";
import type { DiscoverItem } from "@/lib/discover";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import styles from "./discover.module.css";

function DiscoverInner() {
  const params = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("discover");
  const tc = useTranslations("common");
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setItems(null);
    setError(null);
    fetch(`/api/discover?lang=${locale}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setItems(d.items ?? []))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
    // Re-fetch when the language changes so EN↔FR refreshes the translated list.
  }, [reload, locale]);

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell dr-wide`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <Link href={`/menu${qs}`} className={styles.back} aria-label={tc("back")}>
            ←
          </Link>
          <span className="dr-eyebrow">{t("eyebrow")}</span>
          <LocaleSwitcher />
        </header>

        {error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("offline")}</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              {tc("retry")}
            </button>
          </div>
        )}

        {!items && !error && <DiscoverSkeleton />}

        {items && !error && items.length === 0 && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("noSignal")}</p>
            <p className={`mono ${styles.stateErr}`}>{t("empty")}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              {tc("rescan")}
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <p className={`mono dr-enter ${styles.count}`} style={{ "--i": 1 } as CSSProperties}>
              <span className="syn-num">{items.length}</span> {t("found")}
            </p>
            <ul className={`dr-enter ${styles.list}`} style={{ "--i": 2 } as CSSProperties}>
              {items.map((it, i) => (
                <li
                  key={`${it.type}:${it.link || it.title}`}
                  className={styles.item}
                  style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
                >
                  <div className={styles.meta}>
                    <span
                      className={`mono ${styles.badge} ${
                        it.type === "protocol" ? styles.badgeNew : styles.badgeNews
                      }`}
                    >
                      {it.type === "protocol" ? t("tagNew") : t("tagAnnounced")}
                    </span>
                    {it.type === "protocol" && formatUsd(it.tvl) ? (
                      <span className={`mono ${styles.tvl}`}>
                        {t("tvl", { value: formatUsd(it.tvl) })}
                      </span>
                    ) : it.date > 0 ? (
                      <span className={`mono ${styles.date}`}>{timeAgo(it.date)}</span>
                    ) : null}
                  </div>

                  {it.link ? (
                    <a
                      className={styles.title}
                      href={it.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {it.title}
                      <span className={styles.read}>{t("open")}</span>
                    </a>
                  ) : (
                    <span className={styles.title}>{it.title}</span>
                  )}

                  {it.category && (
                    <span className={`mono ${styles.category}`}>{it.category}</span>
                  )}
                </li>
              ))}
            </ul>

            <p className={`mono ${styles.disclaimer}`}>{t("disclaimer")}</p>
          </>
        )}
      </main>
    </>
  );
}

function DiscoverSkeleton() {
  const t = useTranslations("discover");
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">{t("scanning")}</span>
        <span className="dr-cursor" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={styles.skRow}
          style={{ animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}

export default function Discover() {
  return (
    <Suspense fallback={null}>
      <DiscoverInner />
    </Suspense>
  );
}

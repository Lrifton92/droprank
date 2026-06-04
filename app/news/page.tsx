"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { timeAgo } from "../_components/presentation";
import type { NewsItem } from "@/lib/news";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import styles from "./news.module.css";

function NewsInner() {
  const params = useSearchParams();
  const t = useTranslations("news");
  const tc = useTranslations("common");
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setItems(null);
    setError(null);
    fetch("/api/news", { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setItems(d.items ?? []))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
  }, [reload]);

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell ${styles.wide}`}>
        <header className={styles.head}>
          <Link href={`/menu${qs}`} className={styles.back} aria-label={tc("back")}>
            ←
          </Link>
          <span className="dr-eyebrow">{t("baseFeed")}</span>
          <LocaleSwitcher />
        </header>

        {error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("feedOffline")}</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              {tc("retry")}
            </button>
          </div>
        )}

        {!items && !error && <NewsSkeleton />}

        {items && !error && items.length === 0 && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("noSignal")}</p>
            <p className={`mono ${styles.stateErr}`}>{t("noNews")}</p>
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
            <p className={`mono ${styles.count}`}>
              <span className="syn-num">{items.length}</span> {t("signals")}
            </p>
            <ul className={styles.list}>
              {items.map((it, i) => (
                <li
                  key={it.link}
                  className={styles.item}
                  style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
                >
                  <div className={styles.meta}>
                    <span className={`mono ${styles.source}`}>{it.source}</span>
                    <span className={`mono ${styles.date}`}>{timeAgo(it.date)}</span>
                  </div>
                  <a
                    className={styles.title}
                    href={it.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {it.title}
                    <span className={styles.read}>{tc("read")}</span>
                  </a>
                  {it.description && (
                    <p className={styles.desc}>{it.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}

function NewsSkeleton() {
  const t = useTranslations("news");
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">{t("scanningFeed")}</span>
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

export default function News() {
  return (
    <Suspense fallback={null}>
      <NewsInner />
    </Suspense>
  );
}

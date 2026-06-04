"use client";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { timeAgo } from "../_components/presentation";
import type { NewsItem } from "@/lib/news";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import styles from "./news.module.css";

function NewsInner() {
  const params = useSearchParams();
  const locale = useLocale();
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
    fetch(`/api/news?lang=${locale}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setItems(d.items ?? []))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
    // Re-fetch when the language changes so EN↔FR refreshes the translated feed.
  }, [reload, locale]);

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell dr-wide`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
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
            <p className={`mono dr-enter ${styles.count}`} style={{ "--i": 1 } as CSSProperties}>
              <span className="syn-num">{items.length}</span> {t("signals")}
            </p>
            <ul className={`dr-enter ${styles.list}`} style={{ "--i": 2 } as CSSProperties}>
              {items.map((it, i) => (
                <li
                  key={it.link}
                  className={styles.item}
                  style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
                >
                  {it.image && <NewsThumb src={it.image} eager={i < 3} />}
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

/**
 * Article thumbnail with a polished load path:
 *  - shimmer placeholder in the reserved 16/9 box (no layout shift, no flash);
 *  - fade-in once the bytes are decoded (`onLoad`), incl. cache hits via the
 *    ref `complete` check (cached images can fire load before hydration);
 *  - first row (`eager`) loads at high priority, the rest stays lazy;
 *  - `no-referrer` dodges hotlink blocks on common RSS CDNs;
 *  - a dead URL unmounts the box entirely — text-only card, no broken icon.
 */
function NewsThumb({ src, eager }: { src: string; eager: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [dead, setDead] = useState(false);
  if (dead) return null;
  return (
    <span className={`${styles.thumbBox} ${loaded ? styles.thumbReady : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.thumb}
        src={src}
        alt=""
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "low"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setDead(true)}
        ref={(el) => {
          if (el && el.complete && el.naturalWidth > 0 && !loaded) setLoaded(true);
        }}
      />
    </span>
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

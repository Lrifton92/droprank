"use client";
import { Fragment, Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { timeAgo } from "../_components/presentation";
import type { NewsItem } from "@/lib/news";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import styles from "./news.module.css";

/**
 * Recency bucket for the date separators. Items render newest-first, so a
 * bucket change between neighbours marks a section boundary. Buckets (not
 * exact days) keep the feed scannable: today / yesterday / this week / older.
 */
function dateBucket(date: number | string): "today" | "yesterday" | "week" | "older" {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "older";
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return "week";
  return "older";
}

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
            ← <span className={styles.backLabel}>MENU</span>
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
                <Fragment key={it.link}>
                  {/* Date separator whenever the recency bucket changes (items
                      arrive newest-first). Spans the full grid row. */}
                  {dateBucket(it.date) !== (i > 0 ? dateBucket(items[i - 1].date) : null) && (
                    <li className={`mono ${styles.dateSep}`} aria-hidden>
                      <span>{t(`bucket.${dateBucket(it.date)}`)}</span>
                    </li>
                  )}
                <li
                  className={styles.item}
                  style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
                >
                  {it.image ? (
                    <NewsThumb src={it.image} eager={i < 3} source={it.source} />
                  ) : (
                    <NewsPlaceholder source={it.source} seed={it.title} />
                  )}
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
                </Fragment>
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
 *  - a dead URL falls back to the generated placeholder (same 16/9 frame),
 *    so the card never goes thumbnail-less.
 */
function NewsThumb({
  src,
  eager,
  source,
}: {
  src: string;
  eager: boolean;
  source: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [dead, setDead] = useState(false);
  if (dead) return <NewsPlaceholder source={source} seed={source + src} />;
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

/** Six dark gradient pairs drawn from the Base palette — bleu / cyan / violet
 *  doux / vert mint discret, all desaturated so the card reads like a terminal
 *  tile, never clipart. Index is picked by a deterministic hash of the seed. */
const PLACEHOLDER_GRADIENTS = [
  ["#0a1733", "#142a5c"], // deep Base blue
  ["#0a1d2e", "#10384d"], // cyan-leaning teal
  ["#161033", "#28204f"], // soft violet
  ["#0a2120", "#123833"], // discreet mint green
  ["#101a30", "#1d2c52"], // slate blue
  ["#1a1430", "#2a2150"], // indigo
] as const;

/** djb2 — tiny, deterministic, zero deps. Same title ⇒ same gradient forever. */
function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Generated thumbnail for articles with no usable image (the bulk of the feed,
 * since Google News links carry no og:image). Pure CSS/JSX, zero network:
 * a seeded dark gradient + technical grid overlay + the source name in mono,
 * plus a corner tick for materiality. Same 16/9 frame as the real thumb.
 */
function NewsPlaceholder({ source, seed }: { source: string; seed: string }) {
  const [from, to] = PLACEHOLDER_GRADIENTS[hashSeed(seed) % PLACEHOLDER_GRADIENTS.length];
  return (
    <span
      className={`${styles.thumbBox} ${styles.genThumb}`}
      style={{ "--g-from": from, "--g-to": to } as CSSProperties}
      aria-hidden="true"
    >
      <span className={`mono ${styles.genLabel}`}>{source}</span>
      <span className={styles.genTick} />
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

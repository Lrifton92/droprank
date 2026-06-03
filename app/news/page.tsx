"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { timeAgo } from "../_components/presentation";
import type { NewsItem } from "@/lib/news";
import styles from "./news.module.css";

function NewsInner() {
  const params = useSearchParams();
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
      <main className="dr-shell">
        <header className={styles.head}>
          <Link href={`/menu${qs}`} className={styles.back} aria-label="Back">
            ←
          </Link>
          <span className="dr-eyebrow">{"// base feed"}</span>
          <span />
        </header>

        {error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>! FEED OFFLINE</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              ↻ Retry
            </button>
          </div>
        )}

        {!items && !error && <NewsSkeleton />}

        {items && !error && items.length === 0 && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>∅ NO SIGNAL</p>
            <p className={`mono ${styles.stateErr}`}>no base news right now</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              ↻ Rescan
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <p className={`mono ${styles.count}`}>
              <span className="syn-num">{items.length}</span> signals · base l2
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
                    <span className={styles.read}>read ↗</span>
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
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">SCANNING BASE FEED</span>
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

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { timeAgo } from "./presentation";
import type { DiscoverItem } from "@/lib/discover";
import styles from "./DiscoverFeed.module.css";

/**
 * Compact "new on Base" feed for the dashboard — the latest few discover items
 * (protocols + announcements) from /api/discover. Header links through to the
 * full /discover page. Replaces the old static session terminal with live data.
 */
export default function DiscoverFeed({ qs }: { qs: string }) {
  const t = useTranslations("discover");
  const locale = useLocale();
  const [items, setItems] = useState<DiscoverItem[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/discover?lang=${locale}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setItems((d.items ?? []).slice(0, 5)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [locale]);

  return (
    <section className={`dr-panel ${styles.feed}`} aria-label={t("eyebrow")}>
      <Link href={`/discover${qs}`} className={styles.head}>
        <span className="dr-eyebrow">{t("eyebrow")}</span>
        <span className={styles.all} aria-hidden>
          ›
        </span>
      </Link>

      {items === null ? (
        <span className={styles.state}>···</span>
      ) : items.length === 0 ? (
        <span className={styles.state}>{t("empty")}</span>
      ) : (
        <ol className={styles.list}>
          {items.map((it) => (
            <li key={it.link} className={styles.row}>
              <a
                href={it.link}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                <span
                  className={styles.kind}
                  data-news={it.type === "announced" || undefined}
                >
                  {it.type === "protocol" ? it.category ?? "Base" : "News"}
                </span>
                <span className={styles.title}>{it.title}</span>
                <span className={styles.time}>
                  {it.date ? timeAgo(it.date) : ""}
                </span>
                <span className={styles.chev} aria-hidden>
                  ›
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

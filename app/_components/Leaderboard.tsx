"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { base } from "wagmi/chains";
import { Name } from "@coinbase/onchainkit/identity";
import { useTranslations } from "next-intl";
import { tierFor } from "./presentation";
import styles from "./Leaderboard.module.css";

type Entry = { address: string; score: number };

/**
 * Public leaderboard card: the top wallets by DropRank score, pulled from
 * /api/leaderboard (the Upstash percentile sorted-set). Terminal-row layout
 * (fixed columns, tabular nums), top-3 medal-tinted, the connected wallet's row
 * highlighted with a YOU tag. Basenames resolve via OnchainKit, falling back to
 * the address.
 */
export default function Leaderboard({ address }: { address: string }) {
  const t = useTranslations("leaderboard");
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/leaderboard", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEntries(d.entries))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const me = address.toLowerCase();

  return (
    <section className={`dr-panel ${styles.board}`} aria-label={t("title")}>
      <span className={`dr-eyebrow ${styles.head}`}>{t("title")}</span>

      {entries === null ? (
        <span className={styles.state}>···</span>
      ) : entries.length === 0 ? (
        <span className={styles.state}>{t("empty")}</span>
      ) : (
        <ol className={styles.list}>
          {entries.map((e, i) => {
            const tier = tierFor(e.score);
            const isMe = e.address.toLowerCase() === me;
            return (
              <li
                key={e.address}
                className={`${styles.row} ${isMe ? styles.me : ""}`}
                style={{ "--rank": i } as CSSProperties}
              >
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.who}>
                  <Name
                    address={e.address as `0x${string}`}
                    chain={base}
                    className={styles.name}
                  />
                  {isMe && <span className={styles.youTag}>{t("you")}</span>}
                </span>
                <span
                  className={styles.score}
                  style={{ "--tier": tier.color } as CSSProperties}
                >
                  <i className={styles.dot} aria-hidden />
                  {e.score}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

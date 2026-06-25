"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { base } from "wagmi/chains";
import { Name } from "@coinbase/onchainkit/identity";
import { useTranslations } from "next-intl";
import { tierFor } from "./presentation";
import styles from "./Leaderboard.module.css";

type Entry = { address: string; score: number };

/**
 * Public leaderboard — the top wallets by DropRank score (/api/leaderboard).
 * The top 3 are shown as a podium (2nd · 1st · 3rd, bars sized by rank) so the
 * ranking reads at a glance; ranks 4+ follow as a dense list. The connected
 * wallet's row is tagged YOU. Basenames resolve via OnchainKit.
 */
const COLLAPSED = 5;

export default function Leaderboard({ address }: { address: string }) {
  const t = useTranslations("leaderboard");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/leaderboard", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEntries(d.entries))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const me = address.toLowerCase();
  const total = entries?.length ?? 0;
  const shown =
    entries && !expanded ? entries.slice(0, COLLAPSED) : entries ?? [];
  const top3 = shown.slice(0, 3);
  const rest = shown.slice(3);
  // Visual order on the podium: 2nd (left), 1st (centre), 3rd (right).
  const podiumOrder = [top3[1], top3[0], top3[2]];
  const placeFor = (e?: Entry) =>
    e ? top3.indexOf(e) + 1 : 0;

  return (
    <section className={`dr-panel ${styles.board}`} aria-label={t("title")}>
      <span className={`dr-eyebrow ${styles.head}`}>{t("title")}</span>

      {entries === null ? (
        <span className={styles.state}>···</span>
      ) : entries.length === 0 ? (
        <span className={styles.state}>{t("empty")}</span>
      ) : (
        <>
          <div className={styles.podium}>
            {podiumOrder.map((e, i) => {
              if (!e) return <div key={i} className={styles.pod} aria-hidden />;
              const place = placeFor(e); // 1 | 2 | 3
              const tier = tierFor(e.score);
              const isMe = e.address.toLowerCase() === me;
              return (
                <div
                  key={e.address}
                  className={`${styles.pod} ${styles[`pod${place}`]} ${isMe ? styles.podMe : ""}`}
                >
                  <span className={styles.podRank}>{place}</span>
                  <Name
                    address={e.address as `0x${string}`}
                    chain={base}
                    className={styles.podName}
                  />
                  <span
                    className={styles.podScore}
                    style={{ "--tier": tier.color } as CSSProperties}
                  >
                    {e.score}
                  </span>
                  <span className={styles.podBar} aria-hidden />
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <ol className={styles.list} start={4}>
              {rest.map((e, i) => {
                const tier = tierFor(e.score);
                const isMe = e.address.toLowerCase() === me;
                return (
                  <li
                    key={e.address}
                    className={`${styles.row} ${isMe ? styles.me : ""}`}
                    style={{ "--rank": i } as CSSProperties}
                  >
                    <span className={styles.rank}>{i + 4}</span>
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

          {total > COLLAPSED && (
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? t("showLess") : t("showMore", { n: total - COLLAPSED })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

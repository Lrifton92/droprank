"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { timeAgo } from "../_components/presentation";
import type { RecentTx } from "@/lib/recent-activity";
import styles from "./menu.module.css";

/**
 * Recent on-chain activity for the scanned wallet — the last few txs as
 * full-width terminal rows under the tuning dashboard. Pulls the lightweight
 * /api/txs feed (one keyless Blockscout page, never the full scan). NEVER-FAIL:
 * an error or an empty feed renders NOTHING, so it can't break the menu.
 */
export default function RecentActivity({ address }: { address: string }) {
  const t = useTranslations("activity");
  const [txs, setTxs] = useState<RecentTx[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    setLoading(true);
    setTxs(null);
    fetch(`/api/txs/${address}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.txs)) setTxs(d.txs as RecentTx[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [address]);

  // Map the pure-function sentinels to localized labels/actions.
  function labelText(tx: RecentTx): string {
    if (tx.label === "__received__") return t("received");
    if (tx.label === "__deploy__") return t("deploy");
    return tx.label;
  }
  function actionText(tx: RecentTx): string {
    if (tx.action === "__transfer__") return t("transfer");
    if (tx.action === "__interaction__") return t("interaction");
    return tx.action;
  }

  if (loading) {
    return (
      <section className={`dr-panel ${styles.act}`} aria-label={t("title")}>
        <span className={`dr-eyebrow ${styles.actTitle}`}>{t("title")}</span>
        <div className={styles.actList} aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.actSk} />
          ))}
        </div>
      </section>
    );
  }

  // Never-fail: nothing to show -> render nothing (no error surfaced).
  if (!txs || txs.length === 0) return null;

  return (
    <section className={`dr-panel ${styles.act}`} aria-label={t("title")}>
      <span className={`dr-eyebrow ${styles.actTitle}`}>{t("title")}</span>
      <div className={styles.actList}>
        {txs.map((tx, i) => (
          <a
            key={tx.hash}
            href={`https://basescan.org/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.actRow}
            style={{ "--row": i } as CSSProperties}
          >
            <span className={styles.actDir} aria-hidden data-in={tx.incoming || undefined}>
              {tx.incoming ? "↓" : "↑"}
            </span>
            <span className={styles.actAction}>{actionText(tx)}</span>
            <span className={styles.actLabel}>{labelText(tx)}</span>
            <span className={`mono ${styles.actVal}`}>{tx.valueEth}</span>
            <span className={styles.actTime}>{timeAgo(tx.timestamp * 1000)}</span>
            <span className={styles.actArrow} aria-hidden>
              ›
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import { type CSSProperties } from "react";
import { base } from "wagmi/chains";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import type { ScoreResult } from "@/lib/types";
import { tierFor, shortAddr } from "./presentation";
import styles from "./BasenameCard.module.css";

/**
 * Basename identity card (avatar + name via OnchainKit, resolved on Base mainnet
 * since Basenames live on mainnet) with the wallet's DropRank score + tier.
 */
export default function BasenameCard({ address }: { address: string }) {
  const [data, setData] = useState<ScoreResult | null>(null);

  useEffect(() => {
    if (!address) return;
    const ctrl = new AbortController();
    setData(null);
    fetch(`/api/score/${address}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [address]);

  const tier = data ? tierFor(data.score) : null;

  return (
    <div className={styles.card} style={tier ? ({ "--tier": tier.color } as CSSProperties) : undefined}>
      <div className={styles.glow} />
      <Avatar
        address={address as `0x${string}`}
        chain={base}
        className={styles.avatar}
      />
      <div className={styles.info}>
        <Name
          address={address as `0x${string}`}
          chain={base}
          className={styles.name}
        />
        <span className={`mono ${styles.addr}`}>{shortAddr(address)}</span>
      </div>
      <div className={styles.scoreBox}>
        {data ? (
          <>
            <span className={styles.score}>{data.score}</span>
            <span className={styles.max}>/100</span>
            {tier && <span className={styles.tier}>{tier.name}</span>}
          </>
        ) : (
          <span className={styles.score}>··</span>
        )}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { base } from "wagmi/chains";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import { useTranslations } from "next-intl";
import type { ScoreResult } from "@/lib/types";
import { tierFor, shortAddr } from "./presentation";
import WalletDashboard from "./WalletDashboard";
import styles from "./BasenameCard.module.css";

const AVATAR_PX = 160; // stored square size after downscale

const REDUCE = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Count-up 0 → value once the fetch resolves; snaps under reduced-motion. */
function useCountUp(value: number | null, duration = 950): number {
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (value === null) {
      setN(0);
      return;
    }
    if (REDUCE()) {
      setN(value);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setN(Math.round(value * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);
  return n;
}

/** Downscale a picked image to a small square JPEG data URL (cover crop). */
function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width = AVATAR_PX;
      c.height = AVATAR_PX;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

/**
 * Wallet identity + tuning card. The header fuses identity (avatar + basename)
 * with the DropRank score — the score count-up is tinted by tier, with the tier
 * carried by a coloured dot + label and the percentile rank beside it (no
 * separate pill). The WALLET TUNING dashboard is embedded below the divider so
 * the whole wallet reads as one block. The avatar can be overridden by a gallery
 * photo, stored (downscaled) in localStorage per address.
 */
export default function BasenameCard({ address }: { address: string }) {
  const ts = useTranslations("score");
  const [data, setData] = useState<ScoreResult | null>(null);
  const [customImg, setCustomImg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const storeKey = `droprank:avatar:${address.toLowerCase()}`;

  useEffect(() => {
    if (!address) return;
    try {
      setCustomImg(localStorage.getItem(storeKey));
    } catch {
      /* localStorage unavailable */
    }
    const ctrl = new AbortController();
    setData(null);
    fetch(`/api/score/${address}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [address, storeKey]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await downscale(file);
      setCustomImg(dataUrl);
      try {
        localStorage.setItem(storeKey, dataUrl);
      } catch {
        /* quota — keep in-memory only */
      }
    } catch {
      /* ignore unreadable file */
    }
  }

  const tier = data ? tierFor(data.score) : null;
  const scoreN = useCountUp(data ? data.score : null);
  const topPct =
    typeof data?.percentile === "number" ? 100 - data.percentile : null;

  return (
    <div
      className={styles.card}
      style={tier ? ({ "--tier": tier.color } as CSSProperties) : undefined}
    >
      <div className={styles.glow} />

      <div className={styles.top}>
        <div className={styles.avatarWrap}>
          {customImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={customImg} alt="" className={styles.avatar} />
          ) : (
            <Avatar
              address={address as `0x${string}`}
              chain={base}
              className={styles.avatar}
            />
          )}
          <button
            type="button"
            className={styles.edit}
            aria-label="Change photo"
            onClick={() => fileRef.current?.click()}
          >
            ✎
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className={styles.file}
            onChange={onPick}
          />
        </div>

        <div className={styles.info}>
          <Name
            address={address as `0x${string}`}
            chain={base}
            className={styles.name}
          />
          <span className={`mono ${styles.addr}`}>{shortAddr(address)}</span>
        </div>

        <div className={styles.scoreHead}>
          {data ? (
            <>
              <div className={styles.scoreLine}>
                <span className={styles.score}>{scoreN}</span>
                <span className={styles.max}>/100</span>
              </div>
              <div className={styles.meta}>
                {tier && (
                  <>
                    <i className={styles.tierDot} aria-hidden />
                    <span className={styles.tierName}>{tier.name}</span>
                  </>
                )}
                {topPct !== null && (
                  <span className={styles.rank}>
                    · {ts("topPercent", { pct: topPct })}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className={styles.score}>··</span>
          )}
        </div>
      </div>

      <div className={styles.divider} />

      <WalletDashboard address={address} embedded />
    </div>
  );
}

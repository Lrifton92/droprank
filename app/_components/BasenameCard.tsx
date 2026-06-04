"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { base } from "wagmi/chains";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import type { ScoreResult } from "@/lib/types";
import { tierFor, shortAddr } from "./presentation";
import styles from "./BasenameCard.module.css";

const AVATAR_PX = 160; // stored square size after downscale

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
 * Basename identity card: avatar + name (OnchainKit, resolved on Base mainnet)
 * with the wallet's DropRank score + tier. The avatar can be overridden by a
 * photo from the user's gallery, stored (downscaled) in localStorage per address.
 */
export default function BasenameCard({ address }: { address: string }) {
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

  return (
    <div
      className={styles.card}
      style={tier ? ({ "--tier": tier.color } as CSSProperties) : undefined}
    >
      <div className={styles.glow} />

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

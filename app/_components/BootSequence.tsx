"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import styles from "./boot.module.css";

/**
 * The approved "Cube Base → Onde" boot: a Base cube drops + tumbles, shatters
 * into glass shards, rings ripple out, a full blue wave sweeps and reveals the
 * DropRank lockup (droplet zoom + wordmark letter-by-letter), then a progress
 * bar fills. Calls onDone when the bar reaches 100% (or instantly on reduced
 * motion). The droplet SVG mirrors BrandLogo so the brand stays identical.
 */
const LETTERS = [
  { ch: "D", cls: "la" },
  { ch: "r", cls: "la" },
  { ch: "o", cls: "la" },
  { ch: "p", cls: "la" },
  { ch: "·", cls: "ldot" },
  { ch: "R", cls: "lb" },
  { ch: "a", cls: "lb" },
  { ch: "n", cls: "lb" },
  { ch: "k", cls: "lb" },
] as const;

export default function BootSequence({ onDone }: { onDone: () => void }) {
  const t = useTranslations("enter");
  const [pct, setPct] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onDone();
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPct(100);
      const id = setTimeout(finish, 500);
      return () => clearTimeout(id);
    }

    // % counter mirrors the bar fill (starts at 4s, runs 1.8s), then hand off.
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(100, Math.round(((now - t0) / 1800) * 100));
      setPct(p);
      if (p < 100) raf = requestAnimationFrame(tick);
      else setTimeout(finish, 260);
    };
    const start = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 4000);

    return () => {
      clearTimeout(start);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.stage} onClick={onDone} role="presentation">
      <div className={styles.cubeWrap}>
        <div className={styles.cube}>
          <div className={`${styles.face} ${styles.fFront}`} />
          <div className={`${styles.face} ${styles.fBack}`} />
          <div className={`${styles.face} ${styles.fRight}`} />
          <div className={`${styles.face} ${styles.fLeft}`} />
          <div className={`${styles.face} ${styles.fTop}`} />
          <div className={`${styles.face} ${styles.fBottom}`} />
        </div>
      </div>

      <span className={`${styles.shard} ${styles.sh1}`} />
      <span className={`${styles.shard} ${styles.sh2}`} />
      <span className={`${styles.shard} ${styles.sh3}`} />
      <span className={`${styles.shard} ${styles.sh4}`} />
      <span className={`${styles.shard} ${styles.sh5}`} />

      <div className={`${styles.ripple} ${styles.r1}`} />
      <div className={`${styles.ripple} ${styles.r2}`} />
      <div className={`${styles.ripple} ${styles.r3}`} />
      <div className={styles.wave} />

      <div className={styles.core}>
        <div className={styles.lockup}>
          <svg
            className={styles.mark}
            width={52}
            height={52}
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="dr-boot-mark" x1="6" y1="3" x2="26" y2="30" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8ab0ff" />
                <stop offset="0.55" stopColor="#3b5bff" />
                <stop offset="1" stopColor="#0000ff" />
              </linearGradient>
            </defs>
            <path
              d="M16 3.5C16 3.5 25.5 14 25.5 21.2C25.5 26.4 21.2 30.5 16 30.5C10.8 30.5 6.5 26.4 6.5 21.2C6.5 14 16 3.5 16 3.5Z"
              fill="url(#dr-boot-mark)"
            />
            <path
              d="M12.4 11.2C10.6 13.6 9.3 16 9 18.4"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <g fill="rgba(255,255,255,0.95)">
              <rect x="11" y="21.5" width="2.6" height="4.5" rx="1.1" />
              <rect x="14.7" y="18" width="2.6" height="8" rx="1.1" />
              <rect x="18.4" y="14.5" width="2.6" height="11.5" rx="1.1" />
            </g>
          </svg>
          <span className={styles.wordmark} aria-label="Drop·Rank">
            {LETTERS.map((l, i) => (
              <span
                key={i}
                className={`${styles.ltr} ${styles[l.cls]}`}
                style={{ "--i": i } as CSSProperties}
              >
                {l.ch}
              </span>
            ))}
          </span>
        </div>
        <div className={styles.status}>{t("status")}</div>
        <div className={styles.meter}>
          <div className={styles.bar}>
            <i />
          </div>
          <div className={styles.pct}>{pct}%</div>
        </div>
      </div>

      <span className={styles.skip}>{t("skip")}</span>
    </div>
  );
}

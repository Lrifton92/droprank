"use client";
import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { shortAddr } from "../_components/presentation";
import styles from "./enter.module.css";

/**
 * Entry sequence: HUD boot animation before the menu.
 * Sequenced lines + scanlines + rolling counter. Skippable on tap.
 * Total ~3.2s (or reduced-motion: ~600ms). Logic preserved: forwards
 * the address into /menu.
 */
const STEPS = [
  { t: 200, label: "INITIALIZING DROPRANK CORE", tag: "ok" },
  { t: 700, label: "ESTABLISHING BASE LINK", tag: "ok" },
  { t: 1300, label: "SCANNING WALLET", tag: "scan" },
  { t: 2200, label: "INDEXING ONCHAIN ACTIVITY", tag: "ok" },
  { t: 2800, label: "ACCESS GRANTED", tag: "grant" },
] as const;

function EnterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const address = params.get("address") ?? "";
  const [step, setStep] = useState(-1);
  const [pct, setPct] = useState(0);
  const done = useRef(false);

  const go = () => {
    if (done.current) return;
    done.current = true;
    router.replace(`/menu?address=${address}`);
  };

  useEffect(() => {
    if (!address) {
      router.replace("/");
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const t = setTimeout(go, 600);
      return () => clearTimeout(t);
    }

    const timers = STEPS.map((s, i) => setTimeout(() => setStep(i), s.t));
    const total = 3200;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(100, Math.round(((now - t0) / total) * 100));
      setPct(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const end = setTimeout(go, total);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(end);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <main className={styles.wrap} onClick={go} role="presentation">
      <div className={`${styles.scan} dr-scanlines`} />
      <div className={styles.core}>
        <div className={styles.ring}>
          <span
            className={styles.ringTrack}
            style={{ "--p": pct } as CSSProperties}
          />
          <span className={`mono ${styles.ringNum}`}>{pct}</span>
          <small>%</small>
        </div>
        <p className={styles.target}>
          <span className="dr-eyebrow">target</span>
          <span className="mono">{shortAddr(address)}</span>
        </p>
      </div>

      <ul className={styles.log}>
        {STEPS.map((s, i) => (
          <li
            key={s.label}
            className={`${styles.line} ${i <= step ? styles.lineOn : ""} ${
              i === STEPS.length - 1 && step >= i ? styles.grant : ""
            }`}
          >
            <span className={styles.bracket}>
              {i < step ? "[OK]" : i === step ? "[··]" : "[  ]"}
            </span>
            <span>{s.label}</span>
            <span className="dr-cursor" hidden={i !== step} />
          </li>
        ))}
      </ul>

      <button className={styles.skip} onClick={go}>
        tap to skip →
      </button>
    </main>
  );
}

export default function Enter() {
  return (
    <Suspense fallback={null}>
      <EnterInner />
    </Suspense>
  );
}

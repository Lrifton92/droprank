"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import styles from "./score.module.css";

/**
 * Full-screen festive overlay shown once a badge mint/refresh is confirmed.
 * Festive = hand-made canvas confetti + a 3D-tilted glossy badge card + light,
 * never clipart. Closes on Esc, backdrop click or the visible button.
 * Respects prefers-reduced-motion: confetti is skipped and the card sits flat.
 */
export default function MintCelebration({
  score,
  max,
  refresh,
  txUrl,
  onClose,
}: {
  score: number;
  max: number;
  refresh: boolean;
  txUrl: string;
  onClose: () => void;
}) {
  const t = useTranslations("mint");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc to close + focus the close button on mount (a11y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Hand-rolled confetti burst on a canvas — no dependency. Pieces fall under
  // gravity, drift, spin and fade; the loop self-terminates when all settle.
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    if (reduce || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = (canvas.width = window.innerWidth * dpr);
    let h = (canvas.height = window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    // Base-blue palette + a couple of warm sparks; on-brand, never garish.
    const colors = ["#4d86ff", "#8ab0ff", "#0052ff", "#6ce0ff", "#ffffff", "#35e08a"];
    const N = 150;
    type P = {
      x: number; y: number; vx: number; vy: number;
      rot: number; vr: number; size: number; color: string;
      shape: number; life: number;
    };
    const pieces: P[] = Array.from({ length: N }, () => ({
      // Launch from two corners-ish toward center for a "popper" feel.
      x: (Math.random() < 0.5 ? 0.15 : 0.85) * w + (Math.random() - 0.5) * 0.2 * w,
      y: h * 0.4 + (Math.random() - 0.5) * 0.15 * h,
      vx: (Math.random() - 0.5) * 26 * dpr,
      vy: (-Math.random() * 16 - 6) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      size: (Math.random() * 6 + 5) * dpr,
      color: colors[(Math.random() * colors.length) | 0],
      shape: (Math.random() * 3) | 0,
      life: 1,
    }));

    const gravity = 0.42 * dpr;
    const drag = 0.992;
    let raf = 0;
    let frame = 0;

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      frame++;
      let alive = false;
      for (const p of pieces) {
        p.vx *= drag;
        p.vy = p.vy * drag + gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        // Fade out over the last third of the fall, once past mid-screen.
        if (p.y > h * 0.55) p.life -= 0.012;
        if (p.life <= 0 || p.y > h + 40) continue;
        alive = true;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 0) {
          // rectangle ribbon
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else if (p.shape === 1) {
          // circle
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // thin streamer
          ctx.fillRect(-p.size / 6, -p.size / 1.4, p.size / 3, p.size * 1.4);
        }
        ctx.restore();
      }
      if (alive && frame < 480) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return createPortal(
    <div
      className={styles.celebBackdrop}
      data-popup
      role="dialog"
      aria-modal="true"
      aria-label={t("celebTitle")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <canvas ref={canvasRef} className={styles.celebCanvas} aria-hidden="true" />

      <div className={styles.celebCard} role="document">
        <div className={styles.celebBadge}>
          <span className={styles.celebGloss} aria-hidden="true" />
          <span className={styles.celebBadgeLabel}>DROPRANK</span>
          <span className={styles.celebScore}>
            {score}
            <span className={styles.celebScoreMax}>/{max}</span>
          </span>
          <span className={styles.celebBadgeFoot}>
            {refresh ? t("celebKindRefresh") : t("celebKindMint")}
          </span>
        </div>

        <h2 className={styles.celebHeadline}>{t("celebTitle")}</h2>
        <p className={styles.celebSub}>
          {refresh ? t("celebSubRefresh") : t("celebSubMint")}
        </p>

        <div className={styles.celebActions}>
          <a
            className="dr-btn"
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("celebViewTx")}
          </a>
          <button
            ref={closeRef}
            type="button"
            className="dr-btn dr-btn--ghost"
            onClick={onClose}
          >
            {t("celebClose")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

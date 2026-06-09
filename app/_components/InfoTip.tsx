"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./InfoTip.module.css";

/**
 * Small "i" info button with a click-toggled tooltip. The bubble is rendered in
 * a body portal (fixed-positioned from the button rect) so it escapes the
 * backdrop-filtered panels' stacking contexts and never paints behind them.
 * Works on touch (tap) and desktop; closes on outside-click or Escape.
 */
export default function InfoTip({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // The bubble is fixed and grows LEFT from `left` (translateX -100%), width
      // min(300, 78vw). Clamp so its left edge never spills off-screen — the
      // radar's "i" sits near the left edge, where the bubble overflowed left on
      // mobile. Keeps an 8px gutter on both sides.
      const bw = Math.min(300, window.innerWidth * 0.78);
      const left = Math.min(window.innerWidth - 8, Math.max(bw + 8, r.right));
      setPos({ top: r.bottom + 8, left });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !bubbleRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <span className={styles.wrap}>
      <button
        ref={btnRef}
        type="button"
        className={styles.btn}
        aria-label="info"
        aria-expanded={open}
        onClick={(e) => {
          // The tip can live inside a link/button (e.g. a yields pool card that
          // is itself an <a>). Toggling the tip must never trigger that ancestor.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        i
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={bubbleRef}
            role="tooltip"
            className={styles.bubble}
            style={{ top: pos.top, left: pos.left }}
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}

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
      if (r) setPos({ top: r.bottom + 8, left: r.right });
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
        onClick={() => setOpen((o) => !o)}
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

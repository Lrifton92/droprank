"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Count-up that rolls from 0 to `value` once, easing out. Respects
 * prefers-reduced-motion (snaps to final value). tabular-nums via .mono.
 */
export default function Counter({
  value,
  duration = 1100,
  start = 0,
  className,
}: {
  value: number;
  duration?: number;
  start?: number;
  className?: string;
}) {
  const [n, setN] = useState(start);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setN(value);
      return;
    }
    const t0 = performance.now();
    const from = start;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      // easeOutExpo
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(Math.round(from + (value - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, start]);

  return <span className={`mono ${className ?? ""}`}>{n}</span>;
}

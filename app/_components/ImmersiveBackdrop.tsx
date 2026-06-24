"use client";
import { useEffect, useRef } from "react";
import styles from "./ImmersiveBackdrop.module.css";

/**
 * Ambient constellation behind the landing — a drifting Base-blue node network
 * that links nearby points and parallax-shifts toward the pointer, with a soft
 * glow trailing the cursor. Pure canvas, GPU-cheap (O(n²) over a capped node
 * count), DPR-aware. Pauses when the tab is hidden; renders a single static
 * frame under prefers-reduced-motion. Sits at z-index:-1 over .dr-grid-bg,
 * still behind all content. Decorative only (pointer-events: none).
 */
export default function ImmersiveBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const context = el.getContext("2d");
    if (!context) return;
    const canvas: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const LINK = 132; // px under which two nodes are linked

    let w = 0;
    let h = 0;
    let nodes: { x: number; y: number; vx: number; vy: number }[] = [];
    // Large soft Base-blue orbs drifting behind the network — the "Base coin"
    // motif that ties the background to the brand. Deeper plane (more parallax).
    let orbs: { x: number; y: number; r: number; vx: number; vy: number }[] = [];
    // Pointer in 0..1, smoothed toward the target for a floaty parallax.
    const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let raf = 0;

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(80, Math.max(26, (w * h) / 17000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
      }));
      const minDim = Math.min(w, h);
      orbs = Array.from({ length: 4 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: minDim * (0.18 + Math.random() * 0.16),
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
      }));
    }

    function draw(parallax: boolean) {
      ctx.clearRect(0, 0, w, h);
      const ox = parallax ? (ptr.x - 0.5) * -26 : 0;
      const oy = parallax ? (ptr.y - 0.5) * -26 : 0;

      // Base-blue orbs first (deepest plane, ~1.6× the network's parallax).
      for (const o of orbs) {
        if (parallax) {
          o.x += o.vx;
          o.y += o.vy;
          if (o.x < -o.r) o.x = w + o.r;
          else if (o.x > w + o.r) o.x = -o.r;
          if (o.y < -o.r) o.y = h + o.r;
          else if (o.y > h + o.r) o.y = -o.r;
        }
        const cx = o.x + ox * 1.6;
        const cy = o.y + oy * 1.6;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.r);
        g.addColorStop(0, "rgba(0, 82, 255, 0.13)");
        g.addColorStop(0.6, "rgba(0, 82, 255, 0.05)");
        g.addColorStop(1, "rgba(0, 82, 255, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, o.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Glow trailing the pointer — extra depth, very soft.
      const gx = ptr.x * w;
      const gy = ptr.y * h;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.32);
      grad.addColorStop(0, "rgba(0, 82, 255, 0.10)");
      grad.addColorStop(1, "rgba(0, 82, 255, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (const n of nodes) {
        if (parallax) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -20) n.x = w + 20;
          else if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          else if (n.y > h + 20) n.y = -20;
        }
      }

      // Links
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            const alpha = (1 - d / LINK) * 0.42;
            ctx.strokeStyle = `rgba(120, 160, 255, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x + ox, a.y + oy);
            ctx.lineTo(b.x + ox, b.y + oy);
            ctx.stroke();
          }
        }
      }

      // Nodes
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x + ox, n.y + oy, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(138, 176, 255, 0.85)";
        ctx.fill();
      }
    }

    function loop() {
      ptr.x += (ptr.tx - ptr.x) * 0.05;
      ptr.y += (ptr.ty - ptr.y) * 0.05;
      draw(true);
      raf = requestAnimationFrame(loop);
    }

    function onMove(e: PointerEvent) {
      ptr.tx = e.clientX / window.innerWidth;
      ptr.ty = e.clientY / window.innerHeight;
    }
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!reduce && !raf) {
        raf = requestAnimationFrame(loop);
      }
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (reduce) {
      draw(false); // one static frame, no animation
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className={styles.backdrop} aria-hidden />;
}

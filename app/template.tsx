"use client";
import { usePathname } from "next/navigation";

/**
 * App Router template — REMOUNTS on every navigation (unlike layout). We key the
 * wrapper on the pathname so the page-enter animation replays each time the user
 * changes route/menu: a perceptible fade + translateY + slight scale settle.
 *
 * Pure CSS (.dr-template → @keyframes dr-page-enter) so it stays GPU-only
 * (transform/opacity) and is disabled under prefers-reduced-motion in globals.
 * Portalled overlays (MintCelebration → document.body) live outside this subtree,
 * so the transform here never breaks their position: fixed.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="dr-template">
      {children}
    </div>
  );
}

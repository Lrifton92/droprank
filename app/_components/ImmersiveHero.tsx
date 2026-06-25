"use client";
import Link from "next/link";
import BackArrow from "./BackArrow";
import LocaleSwitcher from "./LocaleSwitcher";
import styles from "./ImmersiveHero.module.css";

/**
 * Shared immersive banner header for the app's content pages — the same
 * cinematic Base stage as the dashboard hero (animated grid floor + drifting
 * glows + glassy nav), but at banner height with the page label as the giant
 * overlaid title. Unifies score / radar / news / yields / discover under one
 * look. `label` is the page eyebrow (e.g. "// score report"); the big title
 * reuses it with the "//" rendered as a small accent.
 */
export default function ImmersiveHero({
  label,
  backHref,
  backLabel = "MENU",
  live,
}: {
  label: string;
  backHref: string;
  backLabel?: string;
  live?: string;
}) {
  const clean = label.replace(/^\/\/\s*/, "");
  return (
    <header className={styles.hero}>
      <span className={styles.bg} aria-hidden />
      <span className={styles.floor} aria-hidden />
      <span className={styles.glowA} aria-hidden />
      <span className={styles.glowB} aria-hidden />
      <span className={styles.grain} aria-hidden />
      <span className={styles.scrim} aria-hidden />

      <nav className={styles.nav}>
        <Link href={backHref} className={styles.back} aria-label={backLabel}>
          <BackArrow />
          <span className={styles.backLabel}>{backLabel}</span>
        </Link>
        <div className={styles.navRight}>
          {live && (
            <span className={styles.live}>
              <i className={styles.liveDot} aria-hidden />
              {live}
            </span>
          )}
          <LocaleSwitcher />
        </div>
      </nav>

      <div className={styles.lead}>
        <h1 className={styles.title}>
          <span className={styles.slash}>//</span> {clean}
        </h1>
      </div>
    </header>
  );
}

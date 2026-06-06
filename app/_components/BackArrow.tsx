import styles from "./BackArrow.module.css";

/**
 * Shared left-pointing back arrow — the mirror of the menu's CardArrow: a chevron
 * head at rest whose shaft draws in on hover while the whole arrow nudges left.
 * One SVG element (currentColor), so nothing can overlap the glyph the way the
 * raw "←" unicode did in the mono font.
 *
 * Hover/nudge are driven by the host's hover via the global `dr-back-host` marker
 * class — add it to the back link/button alongside its own (page-scoped) class.
 */
export default function BackArrow() {
  return (
    <span className={styles.wrap} aria-hidden>
      <svg viewBox="0 0 20 12" width="16" height="10" fill="none">
        <path
          className={styles.shaft}
          d="M4 6h14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7.5 1.5 3 6l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

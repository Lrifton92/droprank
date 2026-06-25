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
      <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
        <path
          d="M7.5 2.5 4 6l3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

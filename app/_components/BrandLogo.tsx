import styles from "./BrandLogo.module.css";

/**
 * DropRank brand lockup: a logomark + wordmark.
 *
 * The mark fuses the two halves of the name — a Base-blue droplet ("Drop") with
 * three ascending bars inside ("Rank"), so the icon reads as a ranking inside a
 * drop. Pure inline SVG (crisp at any size, themeable via currentColor/gradient),
 * gradient id suffixed so multiple instances on a page never collide.
 */
export default function BrandLogo({
  size = 26,
  withWordmark = true,
  id = "brand",
}: {
  size?: number;
  withWordmark?: boolean;
  id?: string;
}) {
  const gid = `dr-logo-${id}`;
  return (
    <span className={styles.lockup}>
      <svg
        className={styles.mark}
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        role="img"
        aria-label="DropRank"
      >
        <defs>
          <linearGradient id={gid} x1="6" y1="3" x2="26" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--base-200)" />
            <stop offset="0.55" stopColor="var(--base-300)" />
            <stop offset="1" stopColor="var(--base)" />
          </linearGradient>
        </defs>
        {/* Droplet */}
        <path
          d="M16 3.5C16 3.5 25.5 14 25.5 21.2C25.5 26.4 21.2 30.5 16 30.5C10.8 30.5 6.5 26.4 6.5 21.2C6.5 14 16 3.5 16 3.5Z"
          fill={`url(#${gid})`}
        />
        {/* Specular highlight */}
        <path
          d="M12.4 11.2C10.6 13.6 9.3 16 9 18.4"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Ascending rank bars */}
        <g fill="rgba(255,255,255,0.92)">
          <rect x="11" y="21.5" width="2.6" height="4.5" rx="1.1" />
          <rect x="14.7" y="18" width="2.6" height="8" rx="1.1" />
          <rect x="18.4" y="14.5" width="2.6" height="11.5" rx="1.1" />
        </g>
      </svg>
      {withWordmark && (
        <span className={`dr-brand ${styles.word}`}>
          Drop<span className="dot">·</span>Rank
        </span>
      )}
    </span>
  );
}

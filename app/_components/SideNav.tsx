"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import LocaleSwitcher from "./LocaleSwitcher";
import styles from "./SideNav.module.css";

const ICONS: Record<string, React.ReactNode> = {
  score: (
    <path d="M3 18l5-6 4 4 6-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <path d="M12 12L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  news: (
    <>
      <path d="M4 14a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <path d="M7 17a5 5 0 0 1 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      <circle cx="9" cy="19" r="1.6" fill="currentColor" />
    </>
  ),
  discover: (
    <>
      <path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5 12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="18.5" cy="18.5" r="1.4" fill="currentColor" />
    </>
  ),
  yields: (
    <>
      <path d="M4 17l4-5 3 3 5-7 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 21h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </>
  ),
};

/**
 * Persistent left navigation rail — the app's destinations (score, radar, news,
 * discover, yields) stacked top-to-bottom. Brand on top, a "scan other" footer.
 * The row matching the current route is highlighted. `address` keeps the scanned
 * wallet in the query string across navigation.
 */
export default function SideNav({ address }: { address: string }) {
  const t = useTranslations("menu");
  const tc = useTranslations("common");
  const path = usePathname();
  const qs = address ? `?address=${address}` : "";

  const items = [
    { key: "score", href: "/score", n: "01", title: t("score.title"), sub: t("score.sub") },
    { key: "radar", href: "/radar", n: "02", title: t("radar.title"), sub: t("radar.sub") },
    { key: "news", href: "/news", n: "03", title: t("news.title"), sub: t("news.sub") },
    { key: "discover", href: "/discover", n: "04", title: t("discover.title"), sub: t("discover.sub") },
    { key: "yields", href: "/yields", n: "05", title: t("yield.title"), sub: t("yield.sub") },
  ];

  return (
    <aside className={styles.side}>
      <div className={styles.sideInner}>
        <div className={styles.foot}>
          <Link href={`/menu${qs}`} className={styles.home}>
            ‹ {tc("back")}
          </Link>
          <LocaleSwitcher />
        </div>

        <nav className={styles.nav}>
          {items.map((it) => {
            const active = path === it.href;
            return (
              <Link
                key={it.key}
                href={`${it.href}${qs}`}
                className={`${styles.item} ${active ? styles.itemActive : ""}`}
              >
                <span className={styles.glyph} aria-hidden>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                    {ICONS[it.key]}
                  </svg>
                </span>
                <span className={styles.itemText}>
                  <span className={styles.itemTitle}>{it.title}</span>
                  <span className={styles.itemSub}>{it.sub}</span>
                </span>
                <span className={styles.itemNo}>{it.n}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

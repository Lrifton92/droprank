"use client";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { timeAgo, formatUsd } from "../_components/presentation";
import type { DiscoverItem } from "@/lib/discover";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import BackArrow from "../_components/BackArrow";
import styles from "./discover.module.css";

const REDUCE = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Deterministic 32-bit hash (FNV-1a) of a seed string. Same seed → same sigil,
 * so a given protocol/headline always renders the identical cover across reloads
 * and across the EN/FR list (seed is the link/title, language-independent).
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Up-to-2-char monogram from the title. Skips leading "the/a/an" and symbols so
 * "The Base Bridge" → "BB", "0xProtocol" → "0X". This is derived DATA (not a UI
 * string), so it needs no i18n key. Falls back to "//" (HUD null glyph) if the
 * title has no alphanumerics.
 */
function monogram(title: string): string {
  const words = title
    .replace(/^(the|a|an)\s+/i, "")
    .split(/[\s\-_:.]+/)
    .map((w) => w.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
  if (words.length === 0) return "//";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Derive the per-item cover styling from a seed. Everything stays inside the
 * Base palette (blue hues only — hue jittered ±26° around Base's ~222°), so the
 * generated art reads as on-brand HUD rather than rainbow clipart. Returns CSS
 * custom props consumed by `.cover` in the stylesheet.
 */
function coverVars(seed: string): CSSProperties {
  const h = hash(seed);
  const hue = 222 + (((h & 0xff) / 255) * 52 - 26); // 196..248, blue-cyan band
  const angle = (h >> 8) % 360; // graticule sweep angle
  const gx = 20 + (((h >> 16) & 0x3f) / 0x3f) * 60; // 20..80% focal x
  const gy = 24 + (((h >> 22) & 0x3f) / 0x3f) * 52; // 24..76% focal y
  return {
    "--ch": hue.toFixed(0),
    "--ca": `${angle}deg`,
    "--cx": `${gx.toFixed(0)}%`,
    "--cy": `${gy.toFixed(0)}%`,
  } as CSSProperties;
}

/**
 * A generated cover/sigil for one discover item. No external imagery exists in
 * the data, so every card gets a deterministic on-brand HUD plate: a holographic
 * graticule, a depth glow at a seeded focal point, a slow scanline (looping),
 * and the item's monogram on a higher plane. `variant` "hero" scales it up for
 * the feature card. Purely decorative → aria-hidden.
 */
function Cover({ seed, title, variant }: { seed: string; title: string; variant?: "hero" }) {
  return (
    <span
      className={`${styles.cover} ${variant === "hero" ? styles.coverHero : ""}`}
      style={coverVars(seed)}
      aria-hidden
    >
      <span className={styles.coverGrid} />
      <span className={styles.coverGlow} />
      <span className={styles.coverScan} />
      <span className={styles.coverMono}>{monogram(title)}</span>
      <span className={styles.coverRing} />
    </span>
  );
}

/**
 * Card shell with the dashboard's pointer-driven 3D parallax tilt (±7°, content
 * lifted on Z, cursor spotlight via --mx/--my, one-shot sheen). Mouse-only;
 * touch & reduced-motion never engage and stay flat. Mirrors WalletDashboard's
 * Tile so Discover shares the exact same HUD register.
 */
function TiltCard({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLLIElement>(null);

  function onMove(e: PointerEvent<HTMLLIElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || REDUCE()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - py) * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((px - 0.5) * 10).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  }
  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <li
      ref={ref}
      className={`${styles.item} ${className ?? ""}`}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      <span className={styles.sheen} aria-hidden />
      {children}
    </li>
  );
}

/** The body of a card (meta row → cover → title → category), reused by the
 *  hero and grid variants so they stay visually identical apart from layout. */
function CardBody({
  it,
  variant,
  t,
}: {
  it: DiscoverItem;
  variant?: "hero";
  t: ReturnType<typeof useTranslations>;
}) {
  const seed = it.link || it.title;
  return (
    <div className={styles.inner}>
      <Cover seed={seed} title={it.title} variant={variant} />

      <div className={styles.body}>
        <div className={styles.meta}>
          <span
            className={`mono ${styles.badge} ${
              it.type === "protocol" ? styles.badgeNew : styles.badgeNews
            }`}
          >
            {it.type === "protocol" ? t("tagNew") : t("tagAnnounced")}
          </span>
          {it.type === "protocol" && formatUsd(it.tvl) ? (
            <span className={`mono ${styles.tvl}`}>
              {t("tvl", { value: formatUsd(it.tvl) })}
            </span>
          ) : it.date > 0 ? (
            <span className={`mono ${styles.date}`}>{timeAgo(it.date)}</span>
          ) : null}
        </div>

        {it.link ? (
          <a
            className={styles.title}
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {it.title}
            <span className={styles.read}>{t("open")}</span>
          </a>
        ) : (
          <span className={styles.title}>{it.title}</span>
        )}

        {it.category && (
          <span className={`mono ${styles.category}`}>{it.category}</span>
        )}
      </div>
    </div>
  );
}

function DiscoverInner() {
  const params = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("discover");
  const tc = useTranslations("common");
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setItems(null);
    setError(null);
    fetch(`/api/discover?lang=${locale}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setItems(d.items ?? []))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
    // Re-fetch when the language changes so EN↔FR refreshes the translated list.
  }, [reload, locale]);

  // When the list is short, the first item gets a wide hero treatment and the
  // rest flow in a grid — so a 1–3 item result reads as a deliberate feature
  // layout, never a stubby list. Above the threshold it's a plain even grid.
  const feature = items && items.length > 0 && items.length <= 5;
  const hero = feature ? items![0] : null;
  const rest = feature ? items!.slice(1) : (items ?? []);

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell dr-wide`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <Link href={`/menu${qs}`} className={`dr-back-host ${styles.back}`} aria-label={tc("back")}>
            <BackArrow />
            <span className={styles.backLabel}>MENU</span>
          </Link>
          <span className="dr-eyebrow">{t("eyebrow")}</span>
          <LocaleSwitcher />
        </header>

        {error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("offline")}</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              {tc("retry")}
            </button>
          </div>
        )}

        {!items && !error && <DiscoverSkeleton />}

        {items && !error && items.length === 0 && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("noSignal")}</p>
            <p className={`mono ${styles.stateErr}`}>{t("empty")}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              {tc("rescan")}
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <p className={`mono dr-enter ${styles.count}`} style={{ "--i": 1 } as CSSProperties}>
              <span className="syn-num">{items.length}</span> {t("found")}
            </p>

            {hero && (
              <ul
                className={`dr-enter ${styles.heroWrap}`}
                style={{ "--i": 2 } as CSSProperties}
              >
                <TiltCard
                  className={styles.hero}
                  style={{ animationDelay: "0.04s" } as CSSProperties}
                >
                  <CardBody it={hero} variant="hero" t={t} />
                </TiltCard>
              </ul>
            )}

            <ul
              className={`dr-enter ${styles.list}`}
              style={{ "--i": hero ? 3 : 2 } as CSSProperties}
            >
              {rest.map((it, i) => (
                <TiltCard
                  key={`${it.type}:${it.link || it.title}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
                >
                  <CardBody it={it} t={t} />
                </TiltCard>
              ))}
            </ul>

            <p className={`mono ${styles.disclaimer}`}>{t("disclaimer")}</p>
          </>
        )}
      </main>
    </>
  );
}

function DiscoverSkeleton() {
  const t = useTranslations("discover");
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">{t("scanning")}</span>
        <span className="dr-cursor" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={styles.skRow}
          style={{ animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}

export default function Discover() {
  return (
    <Suspense fallback={null}>
      <DiscoverInner />
    </Suspense>
  );
}

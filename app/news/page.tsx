"use client";
import {
  Fragment,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { timeAgo } from "../_components/presentation";
import type { NewsItem } from "@/lib/news";
import LocaleSwitcher from "../_components/LocaleSwitcher";
import ImmersiveHero from "../_components/ImmersiveHero";
import AppShell from "../_components/AppShell";
import BackArrow from "../_components/BackArrow";
import styles from "./news.module.css";

/**
 * Recency bucket for the date separators — week/month granularity (Soufian
 * 2026-06-05): current calendar week, last week, then one section per month
 * ("mai 2026", …). Items render newest-first, so a bucket-key change between
 * neighbours marks a section boundary.
 */
function weekStart(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday-start weeks
  return x.getTime();
}
function dateBucket(date: number | string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "older";
  const ws = weekStart(d);
  const wsNow = weekStart(new Date());
  if (ws === wsNow) return "thisWeek";
  if (wsNow - ws === 7 * 86_400_000) return "lastWeek";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** Separator label: i18n for the week buckets, locale month name otherwise. */
function bucketLabel(
  key: string,
  t: ReturnType<typeof useTranslations>,
  locale: string,
): string {
  if (key === "thisWeek" || key === "lastWeek" || key === "older") {
    return t(`bucket.${key}`);
  }
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

function NewsInner() {
  const params = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("news");
  const tc = useTranslations("common");
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setItems(null);
    setError(null);
    fetch(`/api/news?lang=${locale}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setItems(d.items ?? []))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      });
    return () => ctrl.abort();
    // Re-fetch when the language changes so EN↔FR refreshes the translated feed.
  }, [reload, locale]);

  return (
    <AppShell address={address}>
        <ImmersiveHero label={t("baseFeed")} backHref={`/menu${qs}`} />

        {error && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("feedOffline")}</p>
            <p className={`mono ${styles.stateErr}`}>{error}</p>
            <button
              className="dr-btn dr-btn--ghost"
              onClick={() => setReload((n) => n + 1)}
            >
              {tc("retry")}
            </button>
          </div>
        )}

        {!items && !error && <NewsSkeleton />}

        {items && !error && items.length === 0 && (
          <div className={styles.state}>
            <p className={styles.stateTitle}>{t("noSignal")}</p>
            <p className={`mono ${styles.stateErr}`}>{t("noNews")}</p>
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
              <span className="syn-num">{items.length}</span> {t("signals")}
            </p>
            <ul className={`dr-enter ${styles.list}`} style={{ "--i": 2 } as CSSProperties}>
              {items.map((it, i) => (
                <Fragment key={it.link}>
                  {/* Date separator whenever the recency bucket changes (items
                      arrive newest-first). Spans the full grid row. */}
                  {dateBucket(it.date) !== (i > 0 ? dateBucket(items[i - 1].date) : null) && (
                    <li className={`mono ${styles.dateSep}`} aria-hidden>
                      <span>{bucketLabel(dateBucket(it.date), t, locale)}</span>
                    </li>
                  )}
                  {/* Short feed → the first (latest) article becomes a full-row
                      feature card with a larger generated cover, so a sparse feed
                      reads as a designed surface rather than a stubby list. */}
                  <NewsCard
                    item={it}
                    index={i}
                    eager={i < 3}
                    hero={items.length <= 4 && i === 0}
                    readLabel={tc("read")}
                  />
                </Fragment>
              ))}
            </ul>
          </>
        )}
    </AppShell>
  );
}

const REDUCE = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One article card with a pointer-driven 3D parallax tilt — the same vocabulary
 * as the wallet dashboard tiles, dialled gentler (±5°) since the card holds
 * long text. The face tilts toward the cursor; --mx/--my drive a roaming
 * spotlight; the inner content sits on a higher Z plane so it floats. Mouse only
 * (e.pointerType === 'mouse'); touch & reduced-motion stay flat and legible.
 */
function NewsCard({
  item,
  index,
  eager,
  hero,
  readLabel,
}: {
  item: NewsItem;
  index: number;
  eager: boolean;
  hero: boolean;
  readLabel: string;
}) {
  const ref = useRef<HTMLLIElement>(null);

  function onMove(e: PointerEvent<HTMLLIElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || REDUCE()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - py) * 10).toFixed(2)}deg`); // ±5°
    el.style.setProperty("--ry", `${((px - 0.5) * 10).toFixed(2)}deg`); // ±5°
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
      className={`${styles.item} ${hero ? styles.hero : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      <span className={styles.itemFace} aria-hidden />
      <span className={styles.itemSheen} aria-hidden />
      <div className={styles.itemInner}>
        {item.image ? (
          <NewsThumb src={item.image} eager={eager} source={item.source} hero={hero} />
        ) : (
          <NewsPlaceholder source={item.source} seed={item.title} hero={hero} />
        )}
        <div className={styles.meta}>
          <span className={`mono ${styles.source}`}>{item.source}</span>
          <span className={`mono ${styles.date}`}>{timeAgo(item.date)}</span>
        </div>
        <a
          className={styles.title}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.title}
          <span className={styles.read}>{readLabel}</span>
        </a>
        {item.description && <p className={styles.desc}>{item.description}</p>}
      </div>
    </li>
  );
}

/**
 * Article thumbnail with a polished load path:
 *  - shimmer placeholder in the reserved 16/9 box (no layout shift, no flash);
 *  - fade-in once the bytes are decoded (`onLoad`), incl. cache hits via the
 *    ref `complete` check (cached images can fire load before hydration);
 *  - first row (`eager`) loads at high priority, the rest stays lazy;
 *  - `no-referrer` dodges hotlink blocks on common RSS CDNs;
 *  - a dead URL falls back to the generated placeholder (same 16/9 frame),
 *    so the card never goes thumbnail-less.
 */
function NewsThumb({
  src,
  eager,
  source,
  hero,
}: {
  src: string;
  eager: boolean;
  source: string;
  hero?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [dead, setDead] = useState(false);
  if (dead) return <NewsPlaceholder source={source} seed={source + src} hero={hero} />;
  return (
    <span
      className={`${styles.thumbBox} ${hero ? styles.heroThumb : ""} ${
        loaded ? styles.thumbReady : ""
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.thumb}
        src={src}
        alt=""
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "low"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setDead(true)}
        ref={(el) => {
          if (el && el.complete && el.naturalWidth > 0 && !loaded) setLoaded(true);
        }}
      />
    </span>
  );
}

/** Six dark gradient pairs drawn from the Base palette — bleu / cyan / violet
 *  doux / vert mint discret, all desaturated so the card reads like a terminal
 *  tile, never clipart. Index is picked by a deterministic hash of the seed. */
const PLACEHOLDER_GRADIENTS = [
  ["#0a1733", "#142a5c"], // deep Base blue
  ["#0a1d2e", "#10384d"], // cyan-leaning teal
  ["#161033", "#28204f"], // soft violet
  ["#0a2120", "#123833"], // discreet mint green
  ["#101a30", "#1d2c52"], // slate blue
  ["#1a1430", "#2a2150"], // indigo
] as const;

/** djb2 — tiny, deterministic, zero deps. Same title ⇒ same gradient forever. */
function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Mulberry32 — tiny deterministic PRNG. A given seed yields the same stream,
 *  so every article gets a unique-but-stable constellation sigil. Zero deps. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic constellation sigil derived from the seed hash. 5–7 nodes are
 * scattered in a 100×56 viewBox (matches the 16/9-ish cover), then linked into a
 * chain plus one or two cross-links — a coherent "circuit/telemetry" motif that
 * is unique per article but always on-brand. Drawn as inline SVG (no network).
 * `aria-hidden` is set by the parent; this returns pure geometry.
 */
function Sigil({ seed }: { seed: number }) {
  const rand = rng(seed);
  const count = 5 + Math.floor(rand() * 3); // 5..7 nodes
  const nodes = Array.from({ length: count }, () => ({
    x: 12 + rand() * 76, // keep off the edges
    y: 8 + rand() * 40,
    r: 1.1 + rand() * 1.6,
  }));
  // Chain consecutive nodes, then add a couple of deterministic cross-links.
  const links: [number, number][] = [];
  for (let i = 1; i < nodes.length; i++) links.push([i - 1, i]);
  const extra = 1 + Math.floor(rand() * 2);
  for (let k = 0; k < extra; k++) {
    const a = Math.floor(rand() * nodes.length);
    const b = Math.floor(rand() * nodes.length);
    if (a !== b) links.push([a, b]);
  }
  return (
    <svg viewBox="0 0 100 56" preserveAspectRatio="xMidYMid slice">
      <g stroke="currentColor" strokeWidth="0.4" opacity="0.5">
        {links.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
          />
        ))}
      </g>
      <g fill="currentColor">
        {nodes.map((n, i) => (
          <circle
            key={i}
            className="gsNode"
            cx={n.x}
            cy={n.y}
            r={n.r}
            style={{ animationDelay: `${(i * 0.32).toFixed(2)}s` }}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * Generated cover for articles with no usable image (the bulk of the feed,
 * since Google News links carry no og:image). Pure CSS/SVG, zero network: a
 * seeded dark gradient, an animated holographic graticule, a roaming scanline
 * (CSS), a deterministic constellation sigil + a hex glyph derived from the same
 * seed, plus the source name in mono and a corner tick. Designed to read as an
 * intentional cover, never a placeholder. Same frame as the real thumb (taller
 * in `hero`). Motion is killed under prefers-reduced-motion (see CSS).
 */
function NewsPlaceholder({
  source,
  seed,
  hero,
}: {
  source: string;
  seed: string;
  hero?: boolean;
}) {
  const h = hashSeed(seed);
  const [from, to] = PLACEHOLDER_GRADIENTS[h % PLACEHOLDER_GRADIENTS.length];
  // Stable per-article hex id from the high bits of the hash.
  const hex = "0x" + ((h >>> 8) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return (
    <span
      className={`${styles.thumbBox} ${styles.genThumb} ${hero ? styles.heroThumb : ""}`}
      style={{ "--g-from": from, "--g-to": to } as CSSProperties}
      aria-hidden="true"
    >
      <span className={`mono ${styles.genHex}`}>{hex}</span>
      <span className={styles.genSigil}>
        <Sigil seed={h} />
      </span>
      <span className={`mono ${styles.genLabel}`}>{source}</span>
      <span className={styles.genTick} />
    </span>
  );
}

function NewsSkeleton() {
  const t = useTranslations("news");
  return (
    <div className={styles.skeleton}>
      <div className={styles.skScan}>
        <span className="mono">{t("scanningFeed")}</span>
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

export default function News() {
  return (
    <Suspense fallback={null}>
      <NewsInner />
    </Suspense>
  );
}

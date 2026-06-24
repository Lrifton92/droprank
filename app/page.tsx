"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAccount } from "wagmi";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import BrandLogo from "./_components/BrandLogo";
import LocaleSwitcher from "./_components/LocaleSwitcher";
import styles from "./landing.module.css";

/* CTA arrow: chevron head at rest, the shaft draws in on hover. */
function BtnArrow() {
  return (
    <span className={styles.btnArrow} aria-hidden>
      <svg viewBox="0 0 20 12" width="18" height="11" fill="none">
        <path
          className={styles.btnArrowShaft}
          d="M2 6h14"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M12.5 1.5 17 6l-4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Splits a phrase into kinetic word spans that rise + unblur, staggered. */
function Kinetic({
  text,
  start = 0,
  accent = false,
}: {
  text: string;
  start?: number;
  accent?: boolean;
}) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span
          key={`${w}-${i}`}
          className={`${styles.word}${accent ? ` ${styles.titleAccent}` : ""}`}
          style={{ "--w": start + i } as CSSProperties}
        >
          {w}
          {i < text.split(" ").length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

const STEP_ICONS = [
  // scan
  <path
    key="i1"
    d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  // estimate
  <path
    key="i2"
    d="M4 19V5m0 14h16M7 16l3.5-4 3 2.5L20 7"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  // grow
  <path
    key="i3"
    d="M12 20V8m0 0-4 4m4-4 4 4M5 4h14"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  // grow allocation (rising chart + arrow)
  <path
    key="i4"
    d="M4 17l5-5 3 3 7-8m0 0v5m0-5h-5"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
  // leaderboard / race (podium bars)
  <path
    key="i5"
    d="M6 21v-7M12 21V5M18 21v-10M3 21h18"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
];

/**
 * Vertical "how it works" carousel for the hero's right column. Cycles through
 * the three explanations; each incoming card re-mounts (keyed by index) so it
 * replays the same blur + rise reveal Soufian liked. A vertical dot rail tracks
 * progress and lets you jump.
 */
const RING_C = 2 * Math.PI * 86;

function StepCarousel() {
  const t = useTranslations("landing");
  // Each card carries its own section label (shown above): the eyebrow switches
  // as the carousel cycles — how-it-works steps, then the number, then the rest.
  const cards = [
    { label: t("how.eyebrow"), type: "step", icon: 0, title: t("how.s1t"), desc: t("how.s1d") },
    { label: t("how.eyebrow"), type: "step", icon: 1, title: t("how.s2t"), desc: t("how.s2d") },
    { label: t("how.eyebrow"), type: "step", icon: 2, title: t("how.s3t"), desc: t("how.s3d") },
    { label: t("reveal.eyebrow"), type: "number" },
    { label: t("grow.eyebrow"), type: "step", icon: 3, title: t("grow.title"), desc: t("grow.sub") },
    { label: t("social.eyebrow"), type: "step", icon: 4, title: t("social.title"), desc: t("social.sub") },
  ] as const;
  const count = cards.length;
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % count);
    }, 3500);
    return () => window.clearInterval(id);
  }, [count]);

  const c = cards[active];
  const total = String(count).padStart(2, "0");
  return (
    <>
      <p className={`${styles.eyebrow} ${styles.carEyebrow}`}>{c.label}</p>
      <div className={styles.carousel}>
        <div className={styles.carStage}>
          <article
            key={active}
            className={`${styles.carCard} ${
              c.type === "number" ? styles.carNumber : ""
            }`}
          >
            <span className={styles.carNo}>
              {String(active + 1).padStart(2, "0")} / {total}
            </span>
            {c.type === "number" ? (
              <>
                <div className={styles.carRing}>
                  <svg viewBox="0 0 200 200" aria-hidden>
                    <circle className={styles.carRingTrack} cx="100" cy="100" r="86" />
                    <circle
                      className={styles.carRingProg}
                      cx="100"
                      cy="100"
                      r="86"
                      strokeDasharray={RING_C}
                      strokeDashoffset={RING_C * 0.28}
                    />
                  </svg>
                  <div className={styles.carRingVal}>
                    <span>
                      <span className={styles.cur}>$</span>1,200
                    </span>
                    <span>
                      <span className={styles.cur}>$</span>3,400
                    </span>
                  </div>
                </div>
                <span className={styles.carNumberLabel}>
                  {t("reveal.rangeLabel")}
                </span>
              </>
            ) : (
              <>
                <span className={styles.carIcon} aria-hidden>
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
                    {STEP_ICONS[c.icon]}
                  </svg>
                </span>
                <span className={styles.carTitle}>{c.title}</span>
                <span className={styles.carDesc}>{c.desc}</span>
              </>
            )}
          </article>
        </div>
        <div className={styles.carRail} aria-hidden>
          {cards.map((_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              className={`${styles.carDot} ${i === active ? styles.carDotOn : ""}`}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Landing — a premium, conversion-first Base website. A deep-blue Base hero (the
 * hook + scan), then sections that alternate light/dark and walk the visitor
 * through the funnel: how it works → the number → grow it → social proof (live
 * leaderboard) → final CTA. Scan logic unchanged (connect or paste → /enter).
 */
export default function Home() {
  const router = useRouter();
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  // Scroll-reveal: elements tagged .reveal fade/slide/blur in as they enter the
  // viewport (agency-grade motion, à la the reference). One-shot per element;
  // snaps in under reduced-motion or without IntersectionObserver.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(`.${styles.reveal}`));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add(styles.revealIn));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.revealIn);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  // No auto-redirect on connect: the landing IS the site and must stay viewable
  // even with a wallet connected. Entering the app is an explicit click (Enter).

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <BrandLogo size={48} />
        <span className={styles.headRight}>
          <span className={styles.status}>
            <i className={styles.statusDot} />
            {tc("baseMainnet")}
          </span>
          <LocaleSwitcher />
        </span>
      </header>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <span className={styles.glow} aria-hidden />
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h1 className={styles.title}>
            <Kinetic text={t("titleLine1")} start={0} />{" "}
            <Kinetic text={t("titleAccent")} start={3} accent />
            <span
              className={`${styles.word} ${styles.titleAccent}`}
              style={{ "--w": 6 } as CSSProperties}
              aria-hidden
            >
              ?
            </span>
          </h1>
          <p className={styles.sub}>{t("sub")}</p>

          <div className={styles.scanCard}>
            <div className={`ockWrap ${styles.connect}`}>
              <Wallet />
            </div>

            {isConnected && address && (
              <button
                className={styles.primaryCta}
                onClick={() => router.push(`/enter?address=${address}`)}
              >
                {t("enter")}
                <BtnArrow />
              </button>
            )}
          </div>
          </div>

          <div className={styles.heroRight}>
            <StepCarousel />
          </div>
        </div>
      </section>

      {/* Everything (number / grow / social-proof) lives in the hero carousel;
          the connect card is the single CTA — no duplicate footer CTA. */}

      <footer className={styles.footer}>
        <BrandLogo size={26} />
        <span className={styles.footTag}>{t("footerTag")}</span>
        <a
          href="https://x.com/lrifton6240"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.footCredit}
        >
          {t("footerCredit")}
        </a>
      </footer>
    </main>
  );
}

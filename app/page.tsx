"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import BrandLogo from "./_components/BrandLogo";
import LocaleSwitcher from "./_components/LocaleSwitcher";
import Leaderboard from "./_components/Leaderboard";
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
];

/**
 * Vertical "how it works" carousel for the hero's right column. Cycles through
 * the three explanations; each incoming card re-mounts (keyed by index) so it
 * replays the same blur + rise reveal Soufian liked. A vertical dot rail tracks
 * progress and lets you jump.
 */
function StepCarousel() {
  const t = useTranslations("landing");
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setActive((a) => (a + 1) % 3), 3800);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className={styles.carousel}>
      <div className={styles.carStage}>
        <article key={active} className={styles.carCard}>
          <span className={styles.carNo}>0{active + 1} / 03</span>
          <span className={styles.carIcon} aria-hidden>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
              {STEP_ICONS[active]}
            </svg>
          </span>
          <span className={styles.carTitle}>{t(`how.s${active + 1}t`)}</span>
          <span className={styles.carDesc}>{t(`how.s${active + 1}d`)}</span>
        </article>
      </div>
      <div className={styles.carRail} aria-hidden>
        {[0, 1, 2].map((i) => (
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
  const [pasted, setPasted] = useState("");

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

  const trimmed = pasted.trim();
  const pastedValid = isAddress(trimmed);
  const dirty = trimmed.length > 0;

  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

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

            <div className={styles.divider}>
              <span>{t("orScan")}</span>
            </div>

            <div className={styles.paste}>
              <input
                id="paste-address"
                className={styles.input}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={t("addressPlaceholder")}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                aria-label={t("walletAddress")}
              />
              {dirty && !pastedValid && (
                <p className={styles.inputErr}>{t("invalidAddress")}</p>
              )}
              <button
                className={styles.primaryCta}
                disabled={!pastedValid}
                onClick={() => router.push(`/enter?address=${trimmed}`)}
              >
                {t("scanThisWallet")}
                <BtnArrow />
              </button>
            </div>
          </div>

          <span className={styles.scrollCue} aria-hidden>
            {t("scrollCue")}
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <path
                d="M8 3v10M3.5 8.5 8 13l4.5-4.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          </div>

          <div className={styles.heroRight}>
            <p className={`${styles.eyebrow} ${styles.carEyebrow}`}>
              {t("how.eyebrow")}
            </p>
            <StepCarousel />
          </div>
        </div>
      </section>

      {/* ── The number — the one Base-blue moment ── */}
      <section className={`${styles.section} ${styles.numberSection}`}>
        <div className={`${styles.sectionInner} ${styles.revealGrid}`}>
          <div className={`${styles.revealCopy} ${styles.reveal}`}>
            <p className={styles.eyebrow}>{t("reveal.eyebrow")}</p>
            <h2 className={styles.h2}>{t("reveal.title")}</h2>
            <p className={styles.sectionSub}>{t("reveal.sub")}</p>
            <p className={styles.revealNote}>{t("reveal.note")}</p>
          </div>
          <div className={`${styles.revealCard} ${styles.reveal}`}>
            <span className={styles.revealExample}>{t("reveal.example")}</span>
            <div className={styles.ringWrap}>
              <svg className={styles.ring} viewBox="0 0 200 200" aria-hidden>
                <defs>
                  <linearGradient id="land-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#8ab0ff" />
                    <stop offset="55%" stopColor="#4d86ff" />
                    <stop offset="100%" stopColor="#0052ff" />
                  </linearGradient>
                </defs>
                <circle className={styles.ringTrack} cx="100" cy="100" r="86" />
                <circle
                  className={styles.ringProg}
                  cx="100"
                  cy="100"
                  r="86"
                  strokeDasharray={2 * Math.PI * 86}
                  strokeDashoffset={2 * Math.PI * 86 * 0.28}
                />
              </svg>
              <div className={styles.ringCenter}>
                <span className={styles.ringLow}>
                  <span className={styles.cur}>$</span>1,200
                </span>
                <span className={styles.ringDash} aria-hidden />
                <span className={styles.ringHigh}>
                  <span className={styles.cur}>$</span>3,400
                </span>
              </div>
            </div>
            <span className={styles.revealRangeLabel}>{t("reveal.rangeLabel")}</span>
          </div>
        </div>
      </section>

      {/* ── Grow it (light) ── */}
      <section className={`${styles.section} ${styles.light}`}>
        <div className={styles.sectionInner}>
          <p className={`${styles.eyebrow} ${styles.eyebrowDark}`}>{t("grow.eyebrow")}</p>
          <h2 className={`${styles.h2} ${styles.h2Dark}`}>{t("grow.title")}</h2>
          <p className={`${styles.sectionSub} ${styles.subDark}`}>{t("grow.sub")}</p>
          <div className={styles.levers}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`${styles.lever} ${styles.reveal}`}
                style={{ transitionDelay: `${(i - 1) * 0.08}s` }}
              >
                <span className={styles.leverMark} aria-hidden>
                  +
                </span>
                <div className={styles.leverText}>
                  <span className={styles.leverTitle}>{t(`grow.l${i}t`)}</span>
                  <span className={styles.leverDesc}>{t(`grow.l${i}d`)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof (dark, live leaderboard) ── */}
      <section className={`${styles.section} ${styles.dark}`}>
        <div className={styles.sectionInner}>
          <p className={styles.eyebrow}>{t("social.eyebrow")}</p>
          <h2 className={styles.h2}>{t("social.title")}</h2>
          <p className={styles.sectionSub}>{t("social.sub")}</p>
          <div className={`${styles.socialBoard} ${styles.reveal}`}>
            <Leaderboard address="" />
          </div>
        </div>
      </section>

      {/* ── Final CTA (blue) ── */}
      <section className={`${styles.section} ${styles.ctaSection}`}>
        <div className={`${styles.sectionInner} ${styles.reveal}`}>
          <h2 className={styles.ctaTitle}>{t("final.title")}</h2>
          <p className={styles.sub}>{t("final.sub")}</p>
          <button className={`${styles.primaryCta} ${styles.ctaBig}`} onClick={toTop}>
            {t("final.cta")}
            <BtnArrow />
          </button>
        </div>
      </section>

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

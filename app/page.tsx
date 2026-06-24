"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isAddress } from "viem";
import { useAccount, useAccountEffect } from "wagmi";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import BrandLogo from "./_components/BrandLogo";
import LocaleSwitcher from "./_components/LocaleSwitcher";
import styles from "./landing.module.css";

/* CTA arrow: chevron head at rest, the shaft draws in on hover while the arrow
   slides right. One element, nothing can overlap the glyph. */
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

/**
 * Landing — a premium, conversion-first Base hero. The whole screen drives one
 * question ("how much is your Base airdrop worth?") to one action (scan). A deep
 * Base-blue stage (the familiar Base look) holds a bright white scan card — the
 * light/dark mix — so the eye lands on the action. Scan logic unchanged: connect
 * (OnchainKit) or paste an address, both route to /enter.
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

  useAccountEffect({
    onConnect({ address: addr, isReconnected }) {
      if (!isReconnected && addr) router.push(`/enter?address=${addr}`);
    },
  });

  const trimmed = pasted.trim();
  const pastedValid = isAddress(trimmed);
  const dirty = trimmed.length > 0;

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <BrandLogo size={34} />
        <span className={styles.headRight}>
          <span className={styles.status}>
            <i className={styles.statusDot} />
            {tc("baseMainnet")}
          </span>
          <LocaleSwitcher />
        </span>
      </header>

      <section className={styles.hero}>
        <span className={styles.glow} aria-hidden />
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h1 className={styles.title}>
            {t("titleLine1")}{" "}
            <span className={styles.titleAccent}>{t("titleAccent")}</span>
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
      </section>
    </main>
  );
}

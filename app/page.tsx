"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isAddress } from "viem";
import { useAccount, useAccountEffect } from "wagmi";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import BaseCube from "./_components/BaseCube";
import LocaleSwitcher from "./_components/LocaleSwitcher";
import styles from "./landing.module.css";

/* CTA arrow: same single-SVG model as the menu CardArrow — chevron head at
   rest, the shaft draws in from the head on button hover while the arrow
   slides right. One element, nothing can overlap the glyph. */
function BtnArrow() {
  return (
    <span className={styles.btnArrow} aria-hidden>
      <svg viewBox="0 0 20 12" width="18" height="11" fill="none">
        <path
          className={styles.btnArrowShaft}
          d="M2 6h14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12.5 1.5 17 6l-4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * Landing. Premium UI over the existing logic:
 *  - Connect Wallet (OnchainKit) -> on connect, go to /enter.
 *  - Paste address (read-only) -> /enter for that address.
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

  // Redirect to the entrance ONLY on a fresh user connect — not on autoConnect
  // reconnection at page load (isReconnected). On reload, the wallet silently
  // reconnects and the user stays on the landing (with an "Enter" CTA below).
  useAccountEffect({
    onConnect({ address: addr, isReconnected }) {
      if (!isReconnected && addr) router.push(`/enter?address=${addr}`);
    },
  });

  const trimmed = pasted.trim();
  const pastedValid = isAddress(trimmed);
  const dirty = trimmed.length > 0;

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell dr-wide ${styles.main}`}>
        <header className={`dr-enter ${styles.head}`} style={{ "--i": 0 } as CSSProperties}>
          <span className="dr-brand">
            Drop<span className="dot">·</span>Rank
          </span>
          <span className={styles.headRight}>
            <span className={styles.status}>
              <i className={styles.statusDot} />
              {tc("baseMainnet")}
            </span>
            <LocaleSwitcher />
          </span>
        </header>

        <div className={styles.layout}>
        <div className={styles.lead}>
          <BaseCube />

          <section className={styles.hero}>
            <p className="dr-eyebrow">{t("eyebrow")}</p>
            <h1 className={styles.title}>
              {t("titleLine1")}
              <br />
              <span className={styles.titleAccent}>{t("titleAccent")}</span>
              <span className="dr-cursor" />
            </h1>
            <p className={styles.sub}>{t("sub")}</p>
          </section>
        </div>

        <section className={`${styles.actions} ${styles.rail}`}>
          <div className={`ockWrap ${styles.connect}`}>
            <Wallet />
          </div>

          {isConnected && address && (
            <button
              className={`dr-btn ${styles.cta}`}
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
            <label htmlFor="paste-address" className="dr-eyebrow">
              {t("walletAddress")}
            </label>
            <input
              id="paste-address"
              className="dr-input"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={t("addressPlaceholder")}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
            />
            {dirty && !pastedValid && (
              <p className={styles.inputErr}>{t("invalidAddress")}</p>
            )}
            <button
              className={`dr-btn dr-btn--ghost ${styles.cta}`}
              disabled={!pastedValid}
              onClick={() => router.push(`/enter?address=${trimmed}`)}
            >
              {t("scanThisWallet")}
              <BtnArrow />
            </button>
          </div>
        </section>
        </div>

        <footer className={styles.foot}>
          <span className="mono">v0.1.0</span>
          <a
            href="https://x.com/lrifton6240"
            target="_blank"
            rel="noopener noreferrer"
            className="mono"
          >
            {t("footerCredit")}
          </a>
        </footer>
      </main>
    </>
  );
}

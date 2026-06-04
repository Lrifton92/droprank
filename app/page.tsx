"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import BaseCube from "./_components/BaseCube";
import LocaleSwitcher from "./_components/LocaleSwitcher";
import styles from "./landing.module.css";

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

  useEffect(() => {
    if (isConnected && address) {
      router.push(`/enter?address=${address}`);
    }
  }, [isConnected, address, router]);

  const trimmed = pasted.trim();
  const pastedValid = isAddress(trimmed);
  const dirty = trimmed.length > 0;

  return (
    <>
      <div className="dr-grid-bg" />
      <main className={`dr-shell ${styles.main}`}>
        <header className={styles.head}>
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

        <section className={styles.actions}>
          <div className={`ockWrap ${styles.connect}`}>
            <Wallet />
          </div>

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
              className="dr-btn dr-btn--ghost"
              disabled={!pastedValid}
              onClick={() => router.push(`/enter?address=${trimmed}`)}
            >
              {t("scanThisWallet")}
            </button>
          </div>
        </section>

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

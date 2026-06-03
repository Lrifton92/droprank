"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import BaseCube from "./_components/BaseCube";
import styles from "./landing.module.css";

/**
 * Landing. Premium UI over the existing logic:
 *  - Connect Wallet (OnchainKit) -> on connect, go to /enter.
 *  - Paste address (read-only) -> /enter for that address.
 */
export default function Home() {
  const router = useRouter();
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
          <span className={styles.status}>
            <i className={styles.statusDot} />
            BASE&nbsp;MAINNET
          </span>
        </header>

        <BaseCube />

        <section className={styles.hero}>
          <p className="dr-eyebrow">{"// onchain reputation engine"}</p>
          <h1 className={styles.title}>
            Your Base airdrop score,
            <br />
            <span className={styles.titleAccent}>ranked.</span>
            <span className="dr-cursor" />
          </h1>
          <p className={styles.sub}>
            Scan any wallet. Get a /100 score, your percentile and a 12-quest
            radar. Mint your rank as a soulbound badge.
          </p>
        </section>

        <section className={styles.actions}>
          <div className={`ockWrap ${styles.connect}`}>
            <Wallet />
          </div>

          <div className={styles.divider}>
            <span>or scan read-only</span>
          </div>

          <div className={styles.paste}>
            <label htmlFor="paste-address" className="dr-eyebrow">
              wallet address
            </label>
            <input
              id="paste-address"
              className="dr-input"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
            />
            {dirty && !pastedValid && (
              <p className={styles.inputErr}>! not a valid address</p>
            )}
            <button
              className="dr-btn dr-btn--ghost"
              disabled={!pastedValid}
              onClick={() => router.push(`/enter?address=${trimmed}`)}
            >
              Scan this wallet →
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
            {"// built on base by @lrifton6240"}
          </a>
        </footer>
      </main>
    </>
  );
}

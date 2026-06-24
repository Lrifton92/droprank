"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useAccount,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { isAddress } from "viem";
import { DROPRANK_BADGE_ABI, BADGE_CHAIN_ID } from "@/lib/badge-abi";
import { useSponsoredWrite } from "../_components/useSponsoredWrite";
import MintCelebration from "./MintCelebration";
import styles from "./score.module.css";

const ZERO = "0x0000000000000000000000000000000000000000";
// Explorer base per chain (84532 = Base Sepolia, else mainnet). Fixes testnet tx links.
const EXPLORER =
  BADGE_CHAIN_ID === 84532
    ? "https://sepolia.basescan.org"
    : "https://basescan.org";
const RAW_CONTRACT = process.env.NEXT_PUBLIC_BADGE_CONTRACT ?? "";
const CONTRACT =
  isAddress(RAW_CONTRACT) && RAW_CONTRACT.toLowerCase() !== ZERO
    ? (RAW_CONTRACT as `0x${string}`)
    : null;

type Phase = "idle" | "signing" | "confirm" | "pending" | "success" | "error";

/**
 * Mint/refresh the soulbound badge for the scanned wallet.
 *  - Disabled "BADGE SOON" until NEXT_PUBLIC_BADGE_CONTRACT is set (non-zero).
 *  - Mint only when the connected wallet === the scanned address (else hint).
 *  - Reads balanceOf to label mint vs refresh.
 */
export default function MintButton({
  scannedAddress,
  empty,
  score,
  max,
}: {
  scannedAddress: string;
  empty: boolean;
  score: number;
  max: number;
}) {
  const t = useTranslations("mint");
  // chainId here is the WALLET's actual chain (useChainId() would return the
  // config's chain — always BADGE_CHAIN_ID — and silently skip the switch).
  const { address: connected, isConnected, chainId: walletChainId } = useAccount();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  // Captured at write time so the celebration label stays stable even after
  // balanceOf refetches and flips `owns`.
  const [wasRefresh, setWasRefresh] = useState(false);

  const tx = useSponsoredWrite(BADGE_CHAIN_ID);
  const { switchChainAsync } = useSwitchChain();
  const { data: balance } = useReadContract({
    abi: DROPRANK_BADGE_ABI,
    address: CONTRACT ?? undefined,
    functionName: "balanceOf",
    args: connected ? [connected] : undefined,
    chainId: BADGE_CHAIN_ID,
    query: { enabled: Boolean(CONTRACT && connected) },
  });

  useEffect(() => {
    if (tx.isSuccess && phase === "pending") {
      setPhase("success");
      setCelebrate(true);
    }
  }, [tx.isSuccess, phase]);

  const owns = typeof balance === "bigint" && balance > BigInt(0);
  const sameWallet =
    isConnected &&
    !!connected &&
    connected.toLowerCase() === scannedAddress.toLowerCase();

  // No contract yet -> disabled placeholder, keeps the page shippable.
  if (!CONTRACT) {
    return (
      <button className="dr-btn" disabled title={t("badgeSoonTitle")}>
        {t("badgeSoon")}
      </button>
    );
  }

  const busy = phase === "signing" || phase === "confirm" || phase === "pending";

  const label =
    phase === "signing"
      ? t("attesting")
      : phase === "confirm"
        ? t("confirmInWallet")
        : phase === "pending"
          ? t("minting")
          : phase === "success"
            ? t("badgeLive")
            : owns
              ? t("refreshBadge")
              : empty
                ? t("mintWhenReady")
                : t("mintBadge");

  async function onMint() {
    if (phase === "success" && tx.txHash) {
      window.open(`${EXPLORER}/tx/${tx.txHash}`, "_blank");
      return;
    }
    setErrMsg("");
    tx.reset();
    try {
      // Ensure the wallet is on the target chain before signing/writing,
      // otherwise the tx reverts on a chain mismatch (wallet may be on mainnet).
      if (walletChainId !== BADGE_CHAIN_ID) {
        await switchChainAsync({ chainId: BADGE_CHAIN_ID });
      }
      setPhase("signing");
      const res = await fetch("/api/sign-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: scannedAddress }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("attestationFailed", { status: res.status }));
      }
      const { score, deadline, signature } = await res.json();

      setPhase("confirm");
      setWasRefresh(owns);
      await tx.submit({
        abi: DROPRANK_BADGE_ABI,
        address: CONTRACT!,
        functionName: owns ? "refresh" : "mint",
        args: [Number(score), BigInt(deadline), signature as `0x${string}`],
      });
      setPhase("pending");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      // Trim verbose wallet rejections to a short line.
      setErrMsg(/user rejected|denied/i.test(m) ? t("cancelled") : m);
      setPhase("error");
    }
  }

  const blocked = !sameWallet && phase !== "success";
  const hint = !isConnected
    ? t("connectToMint")
    : !sameWallet
      ? t("onlyConnectedWallet")
      : "";

  return (
    <span className={styles.mintWrap}>
      <button
        className="dr-btn"
        onClick={onMint}
        disabled={busy || blocked}
        title={hint || undefined}
        aria-busy={busy}
      >
        {label}
      </button>
      {phase === "error" && errMsg && (
        <span className={`mono ${styles.mintNote}`}>! {errMsg}</span>
      )}
      {phase === "pending" && (
        <span className={`mono ${styles.mintNote}`}>{t("txSubmitted")}</span>
      )}
      {phase !== "error" && phase !== "pending" && hint && (
        <span className={`mono ${styles.mintNote}`}>{hint}</span>
      )}
      {celebrate && tx.txHash && (
        <MintCelebration
          score={score}
          max={max}
          refresh={wasRefresh}
          txUrl={`${EXPLORER}/tx/${tx.txHash}`}
          onClose={() => setCelebrate(false)}
        />
      )}
    </span>
  );
}

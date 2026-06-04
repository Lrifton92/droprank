"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress } from "viem";
import { DROPRANK_BADGE_ABI, BADGE_CHAIN_ID } from "@/lib/badge-abi";
import styles from "./score.module.css";

const ZERO = "0x0000000000000000000000000000000000000000";
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
}: {
  scannedAddress: string;
  empty: boolean;
}) {
  const t = useTranslations("mint");
  const { address: connected, isConnected } = useAccount();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const { writeContractAsync } = useWriteContract();
  const { data: balance } = useReadContract({
    abi: DROPRANK_BADGE_ABI,
    address: CONTRACT ?? undefined,
    functionName: "balanceOf",
    args: connected ? [connected] : undefined,
    chainId: BADGE_CHAIN_ID,
    query: { enabled: Boolean(CONTRACT && connected) },
  });
  useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    chainId: BADGE_CHAIN_ID,
    query: { enabled: Boolean(txHash) },
  });

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
    if (phase === "success" && txHash) {
      window.open(`https://basescan.org/tx/${txHash}`, "_blank");
      return;
    }
    setErrMsg("");
    try {
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
      const hash = await writeContractAsync({
        abi: DROPRANK_BADGE_ABI,
        address: CONTRACT!,
        functionName: owns ? "refresh" : "mint",
        args: [Number(score), BigInt(deadline), signature as `0x${string}`],
        chainId: BADGE_CHAIN_ID,
      });
      setTxHash(hash);
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
    </span>
  );
}

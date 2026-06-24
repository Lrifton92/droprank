"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAccount, useSwitchChain, useReadContract } from "wagmi";
import { isAddress } from "viem";
import { DROPRANK_CHECKIN_ABI, CHECKIN_CHAIN_ID } from "@/lib/checkin-abi";
import { useSponsoredWrite } from "../_components/useSponsoredWrite";
import styles from "./score.module.css";

const ZERO = "0x0000000000000000000000000000000000000000";
const RAW = process.env.NEXT_PUBLIC_CHECKIN_CONTRACT ?? "";
const CONTRACT =
  isAddress(RAW) && RAW.toLowerCase() !== ZERO ? (RAW as `0x${string}`) : null;

type Phase = "idle" | "signing" | "confirm" | "pending" | "success" | "error";

export default function CheckinButton({
  scannedAddress, score,
}: { scannedAddress: string; score: number }) {
  const t = useTranslations("checkin");
  const { address: connected, isConnected, chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const tx = useSponsoredWrite(CHECKIN_CHAIN_ID);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");

  // stateOf(wallet) -> [latestScore, count, currentStreak, lastCheckinAt, nonce]
  const { data: state } = useReadContract({
    abi: DROPRANK_CHECKIN_ABI,
    address: CONTRACT ?? undefined,
    functionName: "stateOf",
    args: connected ? [connected] : undefined,
    chainId: CHECKIN_CHAIN_ID,
    query: { enabled: Boolean(CONTRACT && connected) },
  });

  useEffect(() => {
    if (tx.isSuccess && phase === "pending") setPhase("success");
  }, [tx.isSuccess, phase]);

  if (!CONTRACT) {
    return (
      <button className="dr-btn dr-btn--ghost" disabled title={t("soonTitle")}>
        {t("soon")}
      </button>
    );
  }

  const sameWallet =
    isConnected && !!connected &&
    connected.toLowerCase() === scannedAddress.toLowerCase();

  // lastCheckinAt is index 3; compare UTC day to disable a same-day repeat.
  const lastCheckinAt = Array.isArray(state) ? Number(state[3] ?? 0) : 0;
  const checkedInToday =
    lastCheckinAt > 0 &&
    Math.floor(lastCheckinAt / 86400) === Math.floor(Date.now() / 1000 / 86400);

  const busy = phase === "signing" || phase === "confirm" || phase === "pending";
  const label =
    phase === "signing" ? t("attesting")
    : phase === "confirm" ? t("confirmInWallet")
    : phase === "pending" ? t("pending")
    : phase === "success" ? t("done")
    : checkedInToday ? t("alreadyToday")
    : t("checkIn");

  async function onCheckin() {
    setErrMsg("");
    try {
      if (walletChainId !== CHECKIN_CHAIN_ID) {
        await switchChainAsync({ chainId: CHECKIN_CHAIN_ID });
      }
      setPhase("signing");
      const res = await fetch("/api/sign-checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: scannedAddress }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("failed", { status: res.status }));
      }
      const { score: s, deadline, signature } = await res.json();
      setPhase("confirm");
      await tx.submit({
        abi: DROPRANK_CHECKIN_ABI,
        address: CONTRACT!,
        functionName: "checkIn",
        args: [Number(s), BigInt(deadline), signature as `0x${string}`],
      });
      setPhase("pending");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(/user rejected|denied/i.test(m) ? t("cancelled") : m);
      setPhase("error");
    }
  }

  const blocked = !sameWallet && phase !== "success";
  const disabled = busy || blocked || (checkedInToday && phase !== "success");
  const hint = !isConnected
    ? t("connectToCheckin")
    : !sameWallet ? t("onlyConnectedWallet") : "";

  return (
    <span className={styles.mintWrap}>
      <button
        className="dr-btn dr-btn--ghost"
        onClick={onCheckin}
        disabled={disabled}
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

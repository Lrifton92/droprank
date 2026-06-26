"use client";
import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import BootSequence from "./BootSequence";
import styles from "./enter.module.css";

/**
 * Entry boot: plays the approved "Cube Base → Onde" sequence, then forwards the
 * scanned address into /menu. Skippable on tap. Logic preserved.
 */
function EnterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("enter");
  const address = params.get("address") ?? "";
  const done = useRef(false);

  const go = () => {
    if (done.current) return;
    done.current = true;
    router.replace(`/menu?address=${address}`);
  };

  useEffect(() => {
    if (!address) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  if (!address) return null;

  return (
    <main className={styles.wrap} onClick={go} role="presentation">
      <BootSequence onDone={go} />
      <span className={styles.skip}>{t("skip")}</span>
    </main>
  );
}

export default function Enter() {
  return (
    <Suspense fallback={null}>
      <EnterInner />
    </Suspense>
  );
}

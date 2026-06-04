"use client";
import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setUserLocale } from "@/i18n/locale";
import { LOCALES, type Locale } from "@/i18n/config";
import styles from "./LocaleSwitcher.module.css";

/**
 * Discrete HUD language toggle ("EN | FR"). Persists the choice in a cookie
 * (server action) then refreshes so server-resolved messages re-render.
 */
export default function LocaleSwitcher() {
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const pick = (locale: Locale) => {
    if (locale === active || pending) return;
    startTransition(async () => {
      await setUserLocale(locale);
      router.refresh();
    });
  };

  return (
    <div className={`mono ${styles.wrap}`} role="group" aria-label="Language">
      {LOCALES.map((loc, i) => (
        <span key={loc} className={styles.segment}>
          {i > 0 && <span className={styles.sep} aria-hidden>|</span>}
          <button
            type="button"
            className={styles.opt}
            data-active={loc === active}
            aria-pressed={loc === active}
            disabled={pending}
            onClick={() => pick(loc)}
          >
            {loc.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}

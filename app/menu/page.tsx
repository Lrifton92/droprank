"use client";
import { Suspense, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import BaseBanner from "../_components/BaseBanner";
import AppShell from "../_components/AppShell";
import AirdropHero from "./AirdropHero";
import RecentActivity from "./RecentActivity";
import styles from "./menu.module.css";

function MenuInner() {
  const params = useSearchParams();
  const t = useTranslations("menu");
  const address = params.get("address") ?? "";

  return (
    <AppShell address={address}>
      <div className={`dr-enter`} style={{ "--i": 0 } as CSSProperties}>
        <BaseBanner />
      </div>

      <div className={`dr-enter ${styles.zoneHero}`} style={{ "--i": 1 } as CSSProperties}>
        <AirdropHero address={address} />
      </div>

      <div className={`dr-enter`} style={{ "--i": 2 } as CSSProperties}>
        <RecentActivity address={address} />
      </div>

      <div className={`dr-term dr-enter ${styles.term}`} style={{ "--i": 3 } as CSSProperties}>
        <div className="dr-term__bar">
          <i className="dr-term__dot" />
          <i className="dr-term__dot" />
          <i className="dr-term__dot" />
          <span className="dr-term__title">{t("term.title")}</span>
        </div>
        <div className="dr-term__body">
          <div className={`dr-term__row ${styles.termRow}`} style={{ "--row": 0 } as CSSProperties}>
            <span className="syn-key">{t("term.chain")}</span>
            <span className={`syn-str ${styles.termVal}`}>{t("term.chainValue")}</span>
          </div>
          <div className={`dr-term__row ${styles.termRow}`} style={{ "--row": 1 } as CSSProperties}>
            <span className="syn-key">{t("term.mode")}</span>
            <span className={`syn-str ${styles.termVal}`}>{t("term.modeValue")}</span>
          </div>
          <div className={`dr-term__row ${styles.termRow}`} style={{ "--row": 2 } as CSSProperties}>
            <span className="syn-key">{t("term.badge")}</span>
            <span className={`syn-str ${styles.termVal}`}>{t("term.badgeValue")}</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function Menu() {
  return (
    <Suspense fallback={null}>
      <MenuInner />
    </Suspense>
  );
}

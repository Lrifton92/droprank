"use client";
import { Suspense, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import BaseBanner from "../_components/BaseBanner";
import AppShell from "../_components/AppShell";
import DiscoverFeed from "../_components/DiscoverFeed";
import AirdropHero from "./AirdropHero";
import styles from "./menu.module.css";

function MenuInner() {
  const params = useSearchParams();
  const address = params.get("address") ?? "";
  const qs = address ? `?address=${address}` : "";

  return (
    <AppShell
      address={address}
      header={<BaseBanner />}
      footer={<DiscoverFeed qs={qs} />}
    >
      <div className={`dr-enter ${styles.bleed} ${styles.zoneHero}`} style={{ "--i": 0 } as CSSProperties}>
        <AirdropHero address={address} />
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

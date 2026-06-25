"use client";
import type { ReactNode } from "react";
import SideNav from "./SideNav";
import styles from "./AppShell.module.css";

/**
 * Persistent app frame: the left navigation rail + the main content column.
 * Every in-app route (dashboard + score/radar/news/yields/discover) wraps its
 * body in this so the volet stays visible and navigation is continuous.
 */
export default function AppShell({
  address,
  children,
}: {
  address: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="dr-grid-bg" />
      <div className={styles.appShell}>
        <SideNav address={address} />
        <main className={styles.mainCol}>{children}</main>
      </div>
    </>
  );
}

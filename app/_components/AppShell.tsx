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
  header,
  footer,
  children,
}: {
  address: string;
  /** Full-width band rendered ABOVE the rail+content (crosses the whole width,
   *  confining the volet from the top). */
  header?: ReactNode;
  /** Full-width band rendered BELOW the rail+content (confines from the bottom). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="dr-grid-bg" />
      {header}
      <div className={styles.appShell}>
        <SideNav address={address} />
        <main className={styles.mainCol}>{children}</main>
      </div>
      {footer}
    </>
  );
}

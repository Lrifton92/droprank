import styles from "./BaseBanner.module.css";

/**
 * Decorative Base-branded banner for the menu's empty space.
 * Brand wordmark only (no translatable copy) — Base blue, glow + light sweep.
 */
export default function BaseBanner() {
  return (
    <section className={styles.banner} aria-hidden>
      <div className={styles.glow} />
      <div className={styles.grid} />
      <div className={styles.mark}>
        <span className={styles.markInner} />
      </div>
      <div className={styles.copy}>
        <span className={styles.title}>BUILT ON BASE</span>
        <span className={styles.sub}>the onchain economy · L2 by Coinbase</span>
      </div>
      <span className={styles.chip}>ONCHAIN</span>
      <div className={styles.sweep} />
    </section>
  );
}

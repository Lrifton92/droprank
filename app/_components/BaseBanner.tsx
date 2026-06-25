import BrandLogo from "./BrandLogo";
import styles from "./BaseBanner.module.css";

/**
 * Top header band. Carries the DropRank site brand (top-left), the "Built on
 * Base" badge centred, and an ONCHAIN chip on the right.
 */
export default function BaseBanner() {
  return (
    <section className={styles.banner}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.grid} aria-hidden />
      <span className={styles.brand}>
        <BrandLogo size={42} id="banner" />
      </span>
      <div className={styles.mark} aria-hidden>
        <span className={styles.markInner} />
      </div>
      <div className={styles.copy} aria-hidden>
        <span className={styles.title}>BUILT ON BASE</span>
        <span className={styles.sub}>the onchain economy · L2 by Coinbase</span>
      </div>
      <span className={styles.chip} aria-hidden>ONCHAIN</span>
      <div className={styles.sweep} aria-hidden />
    </section>
  );
}

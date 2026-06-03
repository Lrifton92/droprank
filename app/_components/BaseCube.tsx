"use client";
import { useState } from "react";
import styles from "./BaseCube.module.css";

/**
 * Playful Base-blue 3D cube — pure CSS 3D transforms (no three.js).
 * Autonomous loop (rotate + bob + squash&stretch). On hover/tap it does a
 * quick excited spin. Light enough for the mini-app webview.
 */
export default function BaseCube() {
  const [poke, setPoke] = useState(false);

  return (
    <div
      className={styles.stage}
      aria-hidden
      onPointerDown={() => {
        setPoke(true);
        window.setTimeout(() => setPoke(false), 720);
      }}
    >
      <div className={styles.shadow} />
      <div className={`${styles.bob} ${poke ? styles.poke : ""}`}>
        <div className={styles.cube}>
          <span className={`${styles.face} ${styles.front}`} />
          <span className={`${styles.face} ${styles.back}`} />
          <span className={`${styles.face} ${styles.right}`} />
          <span className={`${styles.face} ${styles.left}`} />
          <span className={`${styles.face} ${styles.top}`} />
          <span className={`${styles.face} ${styles.bottom}`} />
        </div>
      </div>
    </div>
  );
}

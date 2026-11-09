import type { CSSProperties } from "react";
import styles from "./moa-loader.module.css";

const papers = [
  { angle: -160, radius: 135, rotation: 12, tone: "a" },
  { angle: -120, radius: 88, rotation: -20, tone: "b" },
  { angle: -85, radius: 92, rotation: 30, tone: "c" },
  { angle: -48, radius: 125, rotation: -8, tone: "a" },
  { angle: -12, radius: 150, rotation: 18, tone: "b" },
  { angle: 22, radius: 140, rotation: -25, tone: "c" },
  { angle: 58, radius: 90, rotation: 10, tone: "a" },
  { angle: 95, radius: 88, rotation: -14, tone: "b" },
  { angle: 135, radius: 120, rotation: 24, tone: "c" },
  { angle: 172, radius: 148, rotation: -6, tone: "a" },
];

/** Decorative progress mark. Its parent owns the accessible status text. */
export function MoaLoader({ size = 64 }: { size?: number }) {
  return <span className={`${styles.kit} ${styles.viewport}`} data-folder-loader aria-hidden="true"
    style={{ width: size, height: size * 5 / 6, "--loader-scale": size / 360, "--T": "3600ms" } as CSSProperties}>
    <span className={styles.scene}>
      <span className={styles.stage}>
        <span className={`${styles.ring} ${styles.ringB}`} />
        <span className={`${styles.ring} ${styles.ringA}`} />
        <span className={styles.folder}><span className={styles.back} /><span className={styles.front} /></span>
        {papers.map((paper, index) => <span key={index} className={styles.orbit} data-loader-paper={index}
          style={{ "--a": `${paper.angle}deg`, "--i": index } as CSSProperties}>
          <span className={styles.paper} style={{ "--r": `${paper.radius}px`, "--rot": `${paper.rotation}deg`, "--i": index, "--tone": `var(--tone-${paper.tone})` } as CSSProperties}>
            <span className={styles.sheet} />
          </span>
        </span>)}
      </span>
    </span>
  </span>;
}

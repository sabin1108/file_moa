import { MoaMark } from "../Icon";
import styles from "./status-notice.module.css";

/** Decorative progress mark. Its parent owns the accessible status text. */
export function MoaLoader({ size = 24 }: { size?: number }) {
  return <span className={styles.loader} aria-hidden="true"><MoaMark size={size} /></span>;
}

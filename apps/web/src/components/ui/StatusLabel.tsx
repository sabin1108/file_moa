import type { ReactNode } from "react";
import styles from "../../styles/controls.module.css";

export function StatusLabel({ children, emphasis = false }: {
  children: ReactNode;
  emphasis?: boolean
}) {
  return <span className={emphasis ? styles.statusEmphasis : styles.status}>
    {children}
  </span>;
}

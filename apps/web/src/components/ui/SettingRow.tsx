import type { ReactNode } from "react";
import styles from "./setting-row.module.css";

export function SettingRow({ title, description, children }: {
  title: string;
  description?: string;
  children: ReactNode
}) {
  return <div className={styles.row}>
    <div>
      <h3>
        {title}
      </h3>
      {description && <p>
        {description}
      </p>}
    </div>
    <div className={styles.control}>
      {children}
    </div>
  </div>;
}

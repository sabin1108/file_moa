"use client";

import { createPortal } from "react-dom";
import { PageLoading } from "./PageLoading";
import styles from "./page-loading.module.css";

export function LoadingOverlay({ message }: { message?: string }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className={styles.navigation} data-navigation-loading>
    <div className={styles.loadingPanel}><PageLoading message={message} /></div>
  </div>, document.body);
}

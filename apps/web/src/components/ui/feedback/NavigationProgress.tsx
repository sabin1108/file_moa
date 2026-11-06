"use client";

import { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import { PageLoading } from "./PageLoading";
import styles from "./page-loading.module.css";

export function NavigationProgress() {
  const { pending } = useLinkStatus();
  if (!pending || typeof document === "undefined") return null;
  return createPortal(<span className={`${styles.navigation} reading-surface`}><PageLoading compact /></span>, document.body);
}

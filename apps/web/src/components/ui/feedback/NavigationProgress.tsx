"use client";

import { useLinkStatus } from "next/link";
import { LoadingOverlay } from "./LoadingOverlay";

export function NavigationProgress() {
  const { pending } = useLinkStatus();
  if (!pending || typeof document === "undefined") return null;
  return <LoadingOverlay />;
}

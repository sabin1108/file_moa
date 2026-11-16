"use client";

import { useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceTour } from "../onboarding/WorkspaceTour";

export function SampleWorkspaceTour({ sessionId, children }: { sessionId: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const claim = useCallback(async () => {
    const key = `moa.sample.guide.${sessionId}`;
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "shown");
    } catch {
      // Explicit entry and replay still work; unknown history must not reopen the guide on every refresh.
      return false;
    }
    return true;
  }, [sessionId]);
  if (!sessionId || pathname === "/demo/intro") return children;
  return <WorkspaceTour mode="sample" claim={claim}>{children}</WorkspaceTour>;
}

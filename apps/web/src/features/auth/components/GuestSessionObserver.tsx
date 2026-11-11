"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CheckAuthSessionAction } from "../../../shared/auth-contract";
import { authSessionSource, subscribeAuthSessionChange, AUTH_SESSION_CHANGED, AUTH_SESSION_STORAGE_KEY } from "../../../shared/auth-session-events";
import { clearSignupDraft } from "../store/signup-draft";

export function GuestSessionObserver({ checkSessionAction }: { checkSessionAction: CheckAuthSessionAction }) {
  const router = useRouter();

  useEffect(() => {
    let sequence = 0;
    const check = async () => {
      const current = ++sequence;

      try {
        const result = await checkSessionAction();

        if (current === sequence && result.available && result.session) {
          clearSignupDraft();
          router.replace("/");
          router.refresh();
        }
      } catch { /* Server guards still reject uncertain authorization. */ }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === AUTH_SESSION_STORAGE_KEY) void check();
    };
    let channel: BroadcastChannel | undefined;

    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(AUTH_SESSION_CHANGED);
        channel.onmessage = event => {
          if (event.data?.type === "changed" && event.data.source !== authSessionSource()) void check();
        };
      }
    } catch { /* Storage and lifecycle checks still revalidate authentication. */ }

    const unsubscribeChanged = subscribeAuthSessionChange(check);

    window.addEventListener("storage", storage);
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);

    return () => {
      ++sequence;

      try {
        channel?.close();
      } catch { /* Remaining subscriptions must still be released. */ }

      unsubscribeChanged();
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [router, checkSessionAction]);

  return null;
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import {
  announceAuthSessionChange,
  authSessionSource,
  revokeAuthScope,
  subscribeAuthSessionChange,
  AUTH_SESSION_CHANGED,
  AUTH_SESSION_STORAGE_KEY
} from "../../../shared/auth-session-events";
import { sessionScope } from "./session-scope";
import type { CheckAuthSessionAction } from "../../../shared/auth-contract";
import { clearSignupDraft } from "../signup/signup-draft";
import { PageLoading } from "../../../components/ui/feedback/PageLoading";

export function SessionBoundary({
  userId,
  initialExpiresAt,
  children,
  checkSessionAction,
}: {
  userId: string;
  initialExpiresAt: string;
  children: ReactNode;
  checkSessionAction: CheckAuthSessionAction;
}) {
  const router = useRouter();
  // The server guard already verified this identity and expiry before rendering the boundary.
  const [active, setActive] = useState(true);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let sequence = 0;
    let announced = false;
    let pending = false;
    let lastSignal: string | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const revoke = () => {
      revokeAuthScope();
      setActive(false);
    };
    const check = async (hide = false, force = false) => {
      if (pending && !force) return;

      pending = true;

      const current = ++sequence;

      if (hide) setChecking(true);

      try {
        const result = await checkSessionAction();

        if (!result.available) throw new Error("session-check-unavailable");

        if (current !== sequence) return;

        const until = sessionScope(result.session, userId);

        if (until === null) {
          revoke();
          router.replace("/login");
          router.refresh();

          return;
        }

        setActive(true);
        setFailed(false);
        clearSignupDraft();

        if (!announced) {
          announced = true;
          announceAuthSessionChange(false, userId);
        }

        clearTimeout(expiry);
        expiry = setTimeout(
          () => {
            revoke();
            void check(true, true);
          },
          Math.min(until - Date.now(), 2_147_000_000),
        );
      } catch {
        if (current !== sequence) return;

        revoke();
        setFailed(true);
      } finally {
        if (current === sequence) {
          pending = false;
          setChecking(false);
        }
      }
    };
    const changed = () => {
      revoke();
      void check(true, true);
    };
    const visible = () => {
      if (document.visibilityState === "visible") void check(false);
    };
    const signal = (value: {
      id?: string;
      userId?: string;
      source?: string
    }) => {
      if (value.source === authSessionSource() || (value.id && value.id === lastSignal)) return;

      lastSignal = value.id;

      if (value.userId === userId) void check(false);
      else changed();
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== AUTH_SESSION_STORAGE_KEY) return;

      try {
        signal(JSON.parse(event.newValue ?? "null") ?? {});
      } catch {
        changed();
      }
    };
    const hidden = () => {
      ++sequence;
      pending = false;
      revoke();
      setChecking(true);
    };
    let channel: BroadcastChannel | undefined;

    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(AUTH_SESSION_CHANGED);
        channel.onmessage = event => {
          if (event.data?.type === "changed") signal(event.data);
        };
      }
    } catch { /* Storage and lifecycle checks still revalidate authentication. */ }

    const unsubscribeChanged = subscribeAuthSessionChange(changed);

    window.addEventListener("storage", storage);
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", visible);
    window.addEventListener("pagehide", hidden);
    document.addEventListener("visibilitychange", visible);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check(false);
    }, 30_000);
    const initialUntil = Date.parse(initialExpiresAt);

    if (Number.isFinite(initialUntil) && initialUntil > Date.now()) {
      expiry = setTimeout(
        () => {
          revoke();
          void check(true, true);
        },
        Math.min(initialUntil - Date.now(), 2_147_000_000),
      );
      void check(false);
    } else {
      revoke();
      void check(true, true);
    }

    return () => {
      ++sequence;
      clearTimeout(expiry);
      clearInterval(timer);

      try {
        channel?.close();
      } catch { /* Remaining subscriptions must still be released. */ }

      unsubscribeChanged();
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pageshow", visible);
      window.removeEventListener("pagehide", hidden);
      document.removeEventListener("visibilitychange", visible);
      revokeAuthScope();
    };
  }, [router, userId, initialExpiresAt, checkSessionAction]);

  return (
    <>
      {(checking || (!active && !failed))
        && (
          <PageLoading
            message={checking ? "로그인 상태를 확인하고 있어요." : "로그인 화면으로 이동하고 있어요."}
          />
        )}
      {failed
        && (
          <StatusNotice
            state="error"
            title="로그인 상태를 확인하지 못했습니다."
            detail="연결을 확인한 뒤 화면을 새로고침해 주세요."
          />
        )}
      {active
        && (
          <div
            inert={checking}
            aria-hidden={checking || undefined}
            style={checking ? { visibility: "hidden" } : undefined}
          >
            {children}
          </div>
        )}
    </>
  );
}

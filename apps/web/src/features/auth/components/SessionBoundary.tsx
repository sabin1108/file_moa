"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { announceAuthSessionChange, authSessionSource, AUTH_SCOPE_REVOKED, AUTH_SESSION_CHANGED, AUTH_SESSION_STORAGE_KEY } from "../../../shared/auth-session-events";
import { sessionScope } from "../lib/session-scope";
import type { CheckAuthSessionAction } from "../../../shared/auth-contract";
import { clearSignupDraft } from "../lib/signup-flow";

export function SessionBoundary({ userId, children, checkSessionAction }: { userId: string; children: ReactNode; checkSessionAction: CheckAuthSessionAction }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let sequence = 0;
    let announced = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const revoke = () => {
      window.dispatchEvent(new Event(AUTH_SCOPE_REVOKED));
      setActive(false);
    };
    const check = async (hide = true) => {
      const current = ++sequence;
      if (hide) setChecking(true);
      setFailed(false);
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
        clearSignupDraft();
        if (!announced) { announced = true; announceAuthSessionChange(false); }
        clearTimeout(expiry);
        expiry = setTimeout(() => { revoke(); void check(); }, Math.min(until - Date.now(), 2_147_000_000));
      } catch {
        if (current !== sequence) return;
        revoke();
        setFailed(true);
      } finally {
        if (current === sequence) setChecking(false);
      }
    };
    const changed = () => { revoke(); void check(); };
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    const storage = (event: StorageEvent) => { if (event.key === AUTH_SESSION_STORAGE_KEY) changed(); };
    const hidden = () => { ++sequence; revoke(); setChecking(true); };
    const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(AUTH_SESSION_CHANGED);
    if (channel) channel.onmessage = event => { if (event.data?.type === "changed" && event.data.source !== authSessionSource()) changed(); };
    window.addEventListener(AUTH_SESSION_CHANGED, changed);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", visible);
    window.addEventListener("pagehide", hidden);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void check(false); }, 30_000);
    void check();
    return () => {
      ++sequence;
      clearTimeout(expiry);
      clearInterval(timer);
      channel?.close();
      window.removeEventListener(AUTH_SESSION_CHANGED, changed);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pageshow", visible);
      window.removeEventListener("pagehide", hidden);
      document.removeEventListener("visibilitychange", visible);
      window.dispatchEvent(new Event(AUTH_SCOPE_REVOKED));
    };
  }, [router, userId, checkSessionAction]);

  return <>
    {checking && <StatusNotice state="pending" title="로그인 상태를 확인하고 있어요." />}
    {failed && <StatusNotice state="error" title="로그인 상태를 확인하지 못했습니다." detail="연결을 확인한 뒤 화면을 새로고침해 주세요." />}
    {active && <div inert={checking} aria-hidden={checking || undefined} style={checking ? { visibility: "hidden" } : undefined}>{children}</div>}
  </>;
}

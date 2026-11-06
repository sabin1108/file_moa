"use client";

import Image from "next/image";
import { useActionState } from "react";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import type { AuthFormAction, AuthFormState } from "../../../shared/auth-contract";
import { socialLabels, type SocialProvider } from "../../../shared/social-auth";
import { announceAuthSessionChange } from "../../../shared/auth-session-events";
import styles from "../../../components/layout/auth-shell.module.css";

export function SocialProviders({ providers, action, intent = "signup" }: { providers: readonly SocialProvider[]; action: AuthFormAction; intent?: "signin" | "signup" }) {
  const [state, formAction, pending] = useActionState(async (previous: AuthFormState, data: FormData) => {
    announceAuthSessionChange();
    try { return await action(previous, data); }
    finally { announceAuthSessionChange(); }
  }, { status: "idle" });

  return <form action={formAction} className={styles.providers} aria-label="소셜 로그인" aria-busy={pending}>
    <input type="hidden" name="intent" value={intent} />
    {providers.map(provider => <button key={provider} type="submit" name="provider" value={provider} className={styles.socialButton} disabled={pending}
      aria-label={`${socialLabels[provider]}로 계속하기`}>
      <Image src={`/auth-providers/${provider}-icon.${provider === "kakao" ? "svg" : "png"}`} alt="" width={40} height={40} unoptimized />
      <span>{socialLabels[provider]}</span>
    </button>)}
    {intent === "signup" && <p className={styles.socialHint}>처음이라면 선택한 소셜 계정으로 가입합니다.</p>}
    {pending && <p className={styles.help}>로그인 서비스로 이동하고 있어요.</p>}
    {state.message && <StatusNotice state="error" title={state.message} role="alert" />}
  </form>;
}

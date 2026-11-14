"use client";

import { ActionLink } from "../../../components/ui/ActionLink";
import type { AuthFormAction } from "../../../shared/auth-contract";
import type { SocialProvider } from "../../../shared/social-auth";
import { SocialProviders } from "../social/SocialProviders";
import styles from "../../../components/layout/auth-shell.module.css";
import { useSavedSignupDraft } from "./useSignupFlow";

export function SignupMethods({ providers, action }: {
  providers: readonly SocialProvider[];
  action: AuthFormAction
}) {
  const draft = useSavedSignupDraft();

  return <section className={styles.form} aria-labelledby="auth-title">
    <h1 id="auth-title">모아 시작하기</h1>
    <p>가입할 방법을 선택해 주세요.</p>
    {!!providers.length && <SocialProviders providers={providers} action={action} />}
    <div className={styles.divider}>
      <span>또는</span>
    </div>
    <ActionLink
      href={`/welcome?step=${draft?.stage ?? "email"}`}
      variant="primary"
      className={styles.start}
    >
      {draft ? "이메일 가입 이어서" : "이메일로 가입하기"}
    </ActionLink>
    <nav className={styles.links} aria-label="계정 메뉴">
      <span>이미 계정이 있나요?</span>
      <ActionLink href="/login">로그인</ActionLink>
    </nav>
  </section>;
}

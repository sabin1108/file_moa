import { AuthShell } from "../../components/layout/AuthShell";
import { ActionLink } from "../../components/ui/ActionLink";
import { SocialProviders } from "../../features/auth/social/SocialProviders";
import { requireGuest } from "../../server/auth/session-guards";
import { socialProviderConfiguration } from "../../server/auth/social-providers";
import { socialProviders } from "../../shared/social-auth";
import { socialSigninAction, checkAuthSessionAction } from "../actions/auth";
import styles from "../../components/layout/auth-shell.module.css";

export default async function Page() {
  await requireGuest();

  const configuration = socialProviderConfiguration();
  const available = socialProviders.filter(provider => configuration[provider]);

  return <AuthShell guest>
    <GuestSessionObserver checkSessionAction={checkAuthSessionAction} />
    <section className={styles.form} aria-labelledby="social-title">
      <h1 id="social-title">소셜 계정으로 새로 가입</h1>
      <p>이메일과 비밀번호를 새로 입력하지 않고 시작할 수 있습니다.</p>
      {available.length
        ? <SocialProviders providers={available} action={socialSigninAction} intent="signup" />
        : <p>소셜 로그인 연결을 준비하고 있습니다. 이메일로 가입할 수 있어요.</p>}
      <nav className={styles.links} aria-label="계정 메뉴">
        <ActionLink href="/login">기존 계정으로 로그인</ActionLink>
        <ActionLink href="/welcome?step=name">이메일로 새로 가입</ActionLink>
      </nav>
    </section>
  </AuthShell>;
}

import { GuestSessionObserver } from "../../features/auth/session/GuestSessionObserver";

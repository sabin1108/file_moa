import { AuthShell } from "../../components/layout/AuthShell";
import { ActionLink } from "../../components/ui/ActionLink";
import { SocialProviders } from "../../features/auth/components/SocialProviders";
import { requireGuest } from "../../server/session-guards";
import { socialProviderConfiguration } from "../../server/social-providers";
import { socialProviders } from "../../shared/social-auth";
import { socialSigninAction, checkAuthSessionAction } from "../actions/auth";
import styles from "../../components/layout/auth-shell.module.css";

export default async function Page() {
  await requireGuest();
  const configuration = socialProviderConfiguration();
  const available = socialProviders.filter(provider => configuration[provider]);
  return <AuthShell><GuestSessionObserver checkSessionAction={checkAuthSessionAction} /><section className={styles.form} aria-labelledby="social-title">
    <h1 id="social-title">소셜 계정으로 새로 가입</h1>
    <p>기존 계정이 있다면 원래 로그인 수단을 이용하세요. 같은 이메일이라는 이유로 계정을 합치지 않습니다.</p>
    {available.length ? <SocialProviders providers={available} action={socialSigninAction} intent="signup" /> : <p>소셜 로그인 연결을 준비하고 있습니다. 이메일로 가입할 수 있어요.</p>}
    <nav className={styles.links} aria-label="계정 메뉴"><ActionLink href="/login">기존 계정으로 로그인</ActionLink><ActionLink href="/welcome">이메일로 새로 가입</ActionLink></nav>
  </section></AuthShell>;
}
import { GuestSessionObserver } from "../../features/auth/components/GuestSessionObserver";

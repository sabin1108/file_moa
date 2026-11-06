import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { loginAction, socialSigninAction, checkAuthSessionAction } from "../actions/auth";
import { requireGuest } from "../../server/session-guards";
import { socialProviderConfiguration } from "../../server/social-providers";
import { socialErrorMessage } from "../../server/auth-social";
import { socialProviders } from "../../shared/social-auth";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGuest();
  const configuration = socialProviderConfiguration();
  const params = await searchParams;
  const notice = params.connection === "updated" ? "계정 연결과 작업 공간 설정을 저장했습니다. 보안을 위해 다시 로그인해 주세요." : socialErrorMessage(params.error);
  return <AuthShell><GuestSessionObserver checkSessionAction={checkAuthSessionAction} /><AuthScreen operation="login" action={loginAction} providers={socialProviders.filter(provider => configuration[provider])} socialAction={socialSigninAction} notice={notice} /></AuthShell>;
}
import { GuestSessionObserver } from "../../features/auth/components/GuestSessionObserver";

import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { signupOperation } from "../../features/auth/lib/form-config";
import { signupAction, resendAction, checkAuthSessionAction, socialSigninAction } from "../actions/auth";
import { requireGuest } from "../../server/session-guards";
import { socialProviderConfiguration } from "../../server/social-providers";
import { socialProviders } from "../../shared/social-auth";
import { SignupMethods } from "../../features/auth/components/SignupMethods";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGuest();
  const step = (await searchParams).step;
  const operation = signupOperation(step);
  const configured = socialProviderConfiguration();
  const providers = socialProviders.filter(provider => configured[provider]);

  return <AuthShell guest><GuestSessionObserver checkSessionAction={checkAuthSessionAction} />{step === undefined
    ? <SignupMethods providers={providers} action={socialSigninAction} />
    : <AuthScreen key={operation} operation={operation} action={operation === "signup" ? signupAction : resendAction} providers={providers} socialAction={socialSigninAction} />}</AuthShell>;
}
import { GuestSessionObserver } from "../../features/auth/components/GuestSessionObserver";

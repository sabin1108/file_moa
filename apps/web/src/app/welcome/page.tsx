import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { signupOperation } from "../../features/auth/lib/form-config";
import { signupAction, resendAction, checkAuthSessionAction } from "../actions/auth";
import { requireGuest } from "../../server/session-guards";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGuest();
  const operation = signupOperation((await searchParams).step);

  return <AuthShell><GuestSessionObserver checkSessionAction={checkAuthSessionAction} /><AuthScreen key={operation} operation={operation} action={operation === "signup" ? signupAction : resendAction} /></AuthShell>;
}
import { GuestSessionObserver } from "../../features/auth/components/GuestSessionObserver";

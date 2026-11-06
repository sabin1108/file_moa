import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { requestResetAction, checkAuthSessionAction } from "../actions/auth";
import { requireGuest } from "../../server/session-guards";

export default async function Page() {
  await requireGuest();
  return <AuthShell><GuestSessionObserver checkSessionAction={checkAuthSessionAction} /><AuthScreen operation="request-reset" action={requestResetAction} /></AuthShell>;
}
import { GuestSessionObserver } from "../../features/auth/components/GuestSessionObserver";

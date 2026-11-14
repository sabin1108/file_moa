import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/form/AuthScreen";
import { requestResetAction, checkAuthSessionAction } from "../actions/auth";
import { requireGuest } from "../../server/auth/session-guards";

export default async function Page() {
  await requireGuest();

  return <AuthShell guest>
    <GuestSessionObserver checkSessionAction={checkAuthSessionAction} />
    <AuthScreen operation="request-reset" action={requestResetAction} />
  </AuthShell>;
}

import { GuestSessionObserver } from "../../features/auth/session/GuestSessionObserver";

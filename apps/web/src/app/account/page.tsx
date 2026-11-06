import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { requireAccountSession } from "../../server/session-guards";
import { signoutAction, checkAuthSessionAction } from "../actions/auth";
import { SessionBoundary } from "../../features/auth/components/SessionBoundary";

export default async function Page() {
  const session = await requireAccountSession();

  return <SessionBoundary userId={session.user.id} initialExpiresAt={session.session.expiresAt.toISOString()} checkSessionAction={checkAuthSessionAction}><AuthShell><AuthScreen operation="signout" action={signoutAction} account={{ name: session.user.name, email: session.user.email }} /></AuthShell></SessionBoundary>;
}

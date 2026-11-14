import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/form/AuthScreen";
import { requireAccountSession } from "../../server/auth/session-guards";
import { signoutAction, profileAction, checkAuthSessionAction } from "../actions/auth";
import { SessionBoundary } from "../../features/auth/session/SessionBoundary";

export default async function Page() {
  const session = await requireAccountSession();

  return (
    <SessionBoundary
      userId={session.user.id}
      initialExpiresAt={session.session.expiresAt.toISOString()}
      checkSessionAction={checkAuthSessionAction}
    >
      <AuthShell>
        {session.user.name.trim()
          ? (
            <AuthScreen
              operation="signout"
              action={signoutAction}
              account={{ name: session.user.name, email: session.user.email }}
            />
          )
          : (
            <AuthScreen operation="profile" action={profileAction} />
          )}
      </AuthShell>
    </SessionBoundary>
  );
}

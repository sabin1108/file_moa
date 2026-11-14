import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/form/AuthScreen";
import { resetAction, checkAuthSessionAction } from "../actions/auth";
import { requireGuest } from "../../server/auth/session-guards";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGuest();

  const token = (await searchParams).token;

  return (
    <AuthShell guest>
      <GuestSessionObserver checkSessionAction={checkAuthSessionAction} />
      <AuthScreen
        operation="reset"
        action={resetAction}
        initialToken={typeof token === "string" && token.length <= 4096 ? token : ""}
      />
    </AuthShell>
  );
}

import { GuestSessionObserver } from "../../features/auth/session/GuestSessionObserver";

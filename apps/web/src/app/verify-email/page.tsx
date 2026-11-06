import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { verifyAction, checkAuthSessionAction } from "../actions/auth";
import { requireGuest } from "../../server/session-guards";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireGuest();
  const token = (await searchParams).token;

  return <AuthShell guest><GuestSessionObserver checkSessionAction={checkAuthSessionAction} /><AuthScreen operation="verify" action={verifyAction} initialToken={typeof token === "string" && token.length <= 4096 ? token : ""} /></AuthShell>;
}
import { GuestSessionObserver } from "../../features/auth/components/GuestSessionObserver";

import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { verifyAction } from "../actions/auth";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = (await searchParams).token;

  return <AuthShell><AuthScreen operation="verify" action={verifyAction} initialToken={typeof token === "string" && token.length <= 4096 ? token : ""} /></AuthShell>;
}

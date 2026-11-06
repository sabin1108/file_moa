import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { resetAction } from "../actions/auth";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = (await searchParams).token;

  return <AuthShell><AuthScreen operation="reset" action={resetAction} initialToken={typeof token === "string" && token.length <= 4096 ? token : ""} /></AuthShell>;
}

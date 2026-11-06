import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { signupOperation } from "../../features/auth/lib/form-config";
import { signupAction, resendAction } from "../actions/auth";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const operation = signupOperation((await searchParams).step);

  return <AuthShell><AuthScreen key={operation} operation={operation} action={operation === "signup" ? signupAction : resendAction} /></AuthShell>;
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { getAuth } from "../../server/auth";
import { signoutAction } from "../actions/auth";

export default async function Page() {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders, query: { disableCookieCache: true, disableRefresh: true } });
  if (!session || !session.user.emailVerified) redirect("/login");

  return <AuthShell><AuthScreen operation="signout" action={signoutAction} account={{ name: session.user.name, email: session.user.email }} /></AuthShell>;
}

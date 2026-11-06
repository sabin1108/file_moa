import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { loginAction } from "../actions/auth";

export default function Page() {
  return <AuthShell><AuthScreen operation="login" action={loginAction} /></AuthShell>;
}

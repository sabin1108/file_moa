import { AuthShell } from "../../components/layout/AuthShell";
import { AuthScreen } from "../../features/auth/components/AuthScreen";
import { requestResetAction } from "../actions/auth";

export default function Page() { return <AuthShell><AuthScreen operation="request-reset" action={requestResetAction} /></AuthShell>; }

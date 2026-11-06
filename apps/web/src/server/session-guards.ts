import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { getAuthenticatedWorkspace } from "./workspace";
import { reportAuthenticationFailure } from "./auth-diagnostics";

async function readGuardSession() {
  const requestHeaders = await headers();
  try {
    const session = await getAuth().api.getSession({ headers: requestHeaders, query: { disableCookieCache: true, disableRefresh: true } });
    return { requestHeaders, session };
  } catch (error) {
    reportAuthenticationFailure("protocol", error);
    throw new Error("로그인 상태를 확인하지 못했습니다.");
  }
}

export async function requireGuest() {
  const { session } = await readGuardSession();

  if (session?.user.emailVerified) redirect("/");
}

export async function requireAccountSession() {
  const { session } = await readGuardSession();
  if (!session?.user.emailVerified) redirect("/login");
  return session;
}

export async function requireWorkspace() {
  const { requestHeaders, session } = await readGuardSession();

  if (!session?.user.emailVerified) redirect("/login");

  try {
    return await getAuthenticatedWorkspace(requestHeaders);
  } catch (error) {
    reportAuthenticationFailure("protocol", error);
    throw new Error("작업 공간을 확인하지 못했습니다.");
  }
}

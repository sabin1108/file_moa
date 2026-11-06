import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "./authenticated-session";
import { getAuthenticatedWorkspace } from "./workspace";
import { reportAuthenticationFailure } from "./auth-diagnostics";

async function readGuardSession() {
  const requestHeaders = await headers();
  try {
    const session = await getAuthenticatedSession(requestHeaders);
    return { requestHeaders, session };
  } catch (error) {
    reportAuthenticationFailure("protocol", error);
    throw new Error("로그인 상태를 확인하지 못했습니다.");
  }
}

export async function requireGuest() {
  const { session } = await readGuardSession();

  if (session) redirect("/");
}

export async function requireAccountSession() {
  const { session } = await readGuardSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireWorkspace() {
  const { requestHeaders, session } = await readGuardSession();

  if (!session) redirect("/login");

  if (!session.user.name.trim()) redirect("/account");

  try {
    return { ...await getAuthenticatedWorkspace(requestHeaders), sessionExpiresAt: session.session.expiresAt.toISOString() };
  } catch (error) {
    reportAuthenticationFailure("protocol", error);
    throw new Error("작업 공간을 확인하지 못했습니다.");
  }
}

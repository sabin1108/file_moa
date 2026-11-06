"use server";

import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import type { AuthFormState, AuthOperation, AuthSessionSnapshot } from "../../shared/auth-contract";
import { submitAuthForm } from "../../server/auth-forms";
import { requireGuest } from "../../server/session-guards";
import { beginSocialSignIn } from "../../server/auth-social";
import { getAuth } from "../../server/auth";

async function applyAuthCookies(response?: Response) {
  const returnedCookies = response?.headers.get("set-cookie");
  if (!returnedCookies) return;
  const store = await cookies();
  for (const [name, cookie] of parseSetCookieHeader(returnedCookies)) store.set(name, cookie.value, toCookieOptions(cookie));
}

async function perform(operation: AuthOperation, formData: FormData): Promise<AuthFormState> {
  if (operation !== "signout") await requireGuest();
  const { state, response } = await submitAuthForm(operation, formData, new Headers(await headers()));
  await applyAuthCookies(response);

  return state;
}

export async function loginAction(_previous: AuthFormState, data: FormData) {
  const state = await perform("login", data);
  if (state.status === "success") redirect("/");

  return state;
}

export async function signupAction(_previous: AuthFormState, data: FormData) { return perform("signup", data); }
export async function resendAction(_previous: AuthFormState, data: FormData) { return perform("resend", data); }
export async function requestResetAction(_previous: AuthFormState, data: FormData) { return perform("request-reset", data); }
export async function verifyAction(_previous: AuthFormState, data: FormData) { return perform("verify", data); }
export async function resetAction(_previous: AuthFormState, data: FormData) { return perform("reset", data); }

export async function socialSigninAction(_previous: AuthFormState, data: FormData) {
  await requireGuest();
  const result = await beginSocialSignIn(data, new Headers(await headers()));
  await applyAuthCookies(result.response);
  if (result.url) redirect(result.url);
  return result.state;
}

export async function checkAuthSessionAction(): Promise<{ available: boolean; session: AuthSessionSnapshot }> {
  const requestHeaders = await headers();
  try {
    const value = await getAuth().api.getSession({ headers: requestHeaders, query: { disableCookieCache: true, disableRefresh: true } });
    return { available: true, session: value ? { user: { id: value.user.id, emailVerified: value.user.emailVerified }, session: { userId: value.session.userId, expiresAt: value.session.expiresAt.toISOString() } } : null };
  } catch {
    return { available: false, session: null };
  }
}

export async function signoutAction() {
  const state = await perform("signout", new FormData());
  if (state.status === "success") redirect("/login");

  return state;
}

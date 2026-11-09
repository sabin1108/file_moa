"use server";

import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import type { AuthFormState, AuthOperation, AuthSessionSnapshot } from "../../shared/auth-contract";
import { submitAuthForm } from "../../server/auth-forms";
import { requireGuest, requireAccountSession } from "../../server/session-guards";
import { beginSocialSignIn } from "../../server/auth-social";
import { getAuthenticatedSession } from "../../server/authenticated-session";
import { manageSocialAccount } from "../../server/auth-account";
import { finishAccountDeletion, requestAccountDeletion } from "../../server/auth-account-deletion";
import { reportAuthenticationFailure } from "../../server/auth-diagnostics";
import { connectExistingAccount, selectConnectedWorkspace, disconnectAccountConnection } from "../../server/auth-account-connection";

async function applyAuthCookies(response?: Response) {
  const returnedCookies = response?.headers.get("set-cookie");
  if (!returnedCookies) return;
  const store = await cookies();
  for (const [name, cookie] of parseSetCookieHeader(returnedCookies)) store.set(name, cookie.value, toCookieOptions(cookie));
}

async function perform(operation: AuthOperation, formData: FormData): Promise<AuthFormState> {
  if (operation === "profile") await requireAccountSession();
  else if (operation !== "signout") await requireGuest();
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
export async function profileAction(_previous: AuthFormState, data: FormData) {
  const state = await perform("profile", data);
  if (state.status === "success") redirect("/");
  return state;
}
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

export async function socialAccountAction(_previous: AuthFormState, data: FormData) {
  let result: Awaited<ReturnType<typeof manageSocialAccount>>;
  try { result = await manageSocialAccount(data, new Headers(await headers())); }
  catch (error) { reportAuthenticationFailure("form", error); return { status: "error" as const, message: "로그인 수단을 변경하지 못했습니다. 다시 시도해 주세요." }; }
  await applyAuthCookies(result.response);
  if (result.url) redirect(result.url);
  return result.state;
}

export async function accountDeletionAction(_previous: AuthFormState, data: FormData) {
  try {
    return await requestAccountDeletion(data, new Headers(await headers()));
  } catch (error) {
    reportAuthenticationFailure("form", error);
    return { status: "error" as const, message: "계정 삭제 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

function clearDeletedAccountSessionCookies(store: Awaited<ReturnType<typeof cookies>>) {
  store.set({ name: "better-auth.session_token", value: "", path: "/", expires: new Date(0), httpOnly: true, sameSite: "lax", secure: false });
  store.set({ name: "__Secure-better-auth.session_token", value: "", path: "/", expires: new Date(0), httpOnly: true, sameSite: "lax", secure: true });
}

export async function finishAccountDeletionAction(_previous: AuthFormState, data: FormData) {
  let state: AuthFormState;
  try {
    state = await finishAccountDeletion(data, new Headers(await headers()));
  } catch (error) {
    reportAuthenticationFailure("form", error);
    return { status: "error" as const, message: "계정 삭제를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (state.status === "success") {
    clearDeletedAccountSessionCookies(await cookies());
    redirect("/login?deleted=1");
  }
  return state;
}

async function changeAccountConnection(data: FormData, operation: typeof connectExistingAccount) {
  let state: AuthFormState;
  try { state = await operation(data, new Headers(await headers())); }
  catch (error) { reportAuthenticationFailure("form", error); return { status: "error" as const, message: "계정을 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }; }
  if (state.status === "success") redirect("/login?connection=updated");
  return state;
}

export async function connectExistingAccountAction(_previous: AuthFormState, data: FormData) { return changeAccountConnection(data, connectExistingAccount); }
export async function selectConnectedWorkspaceAction(_previous: AuthFormState, data: FormData) { return changeAccountConnection(data, selectConnectedWorkspace); }
export async function disconnectAccountConnectionAction(_previous: AuthFormState, data: FormData) { return changeAccountConnection(data, disconnectAccountConnection); }

export async function checkAuthSessionAction(): Promise<{ available: boolean; session: AuthSessionSnapshot }> {
  const requestHeaders = await headers();
  try {
    const value = await getAuthenticatedSession(requestHeaders);
    return {
      available: true,
      session: value
        ? {
            user: { id: value.user.id, emailVerified: value.user.emailVerified },
            session: {
              userId: value.session.userId,
              expiresAt: value.session.expiresAt.toISOString(),
            },
          }
        : null,
    };
  } catch {
    return { available: false, session: null };
  }
}

export async function signoutAction() {
  const state = await perform("signout", new FormData());
  if (state.status === "success") redirect("/login");

  return state;
}

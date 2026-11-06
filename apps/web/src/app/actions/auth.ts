"use server";

import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import type { AuthFormState, AuthOperation } from "../../shared/auth-contract";
import { submitAuthForm } from "../../server/auth-forms";

async function perform(operation: AuthOperation, formData: FormData): Promise<AuthFormState> {
  const { state, response } = await submitAuthForm(operation, formData, new Headers(await headers()));
  const returnedCookies = response?.headers.get("set-cookie");

  if (returnedCookies) {
    const store = await cookies();

    for (const [name, cookie] of parseSetCookieHeader(returnedCookies)) {
      store.set(name, cookie.value, toCookieOptions(cookie));
    }
  }

  return state;
}

export async function loginAction(_previous: AuthFormState, data: FormData) {
  const state = await perform("login", data);
  if (state.status === "success") redirect("/account");

  return state;
}

export async function signupAction(_previous: AuthFormState, data: FormData) { return perform("signup", data); }
export async function resendAction(_previous: AuthFormState, data: FormData) { return perform("resend", data); }
export async function requestResetAction(_previous: AuthFormState, data: FormData) { return perform("request-reset", data); }
export async function verifyAction(_previous: AuthFormState, data: FormData) { return perform("verify", data); }
export async function resetAction(_previous: AuthFormState, data: FormData) { return perform("reset", data); }

export async function signoutAction() {
  const state = await perform("signout", new FormData());
  if (state.status === "success") redirect("/login");

  return state;
}

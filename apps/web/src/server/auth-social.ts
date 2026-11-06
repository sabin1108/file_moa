import "server-only";

import { z } from "zod";
import type { AuthFormState } from "../shared/auth-contract";
import { socialProviders, type SocialProvider } from "../shared/social-auth";
import { getAuth } from "./auth";
import { handleAuthRequest } from "./auth-handler";

const messages: Record<string, string> = {
  access_denied: "소셜 로그인을 취소했습니다. 다시 선택할 수 있어요.",
  account_not_linked: "같은 이메일의 계정이 있습니다. 기존 방식으로 로그인한 뒤 설정의 ‘계정과 로그인’에서 이 소셜 계정을 연결해 주세요.",
  signup_disabled: "아직 연결된 계정이 없습니다. 기존 계정으로 로그인하거나 새 계정 만들기를 선택해 주세요.",
  email_not_verified: "이메일 확인이 필요합니다. 이메일 확인 안내에서 인증 메일을 요청해 주세요.",
  email_not_found: "이메일 정보를 받지 못했습니다. 제공 동의를 확인하거나 이메일 가입을 이용해 주세요.",
  unable_to_get_user_info: "소셜 계정 정보를 확인하지 못했습니다. 이메일 제공 동의와 연결 설정을 확인해 주세요.",
  state_not_found: "로그인 요청이 만료됐습니다. 로그인 화면에서 다시 시작해 주세요.",
  state_mismatch: "로그인 요청을 확인하지 못했습니다. 로그인 화면에서 다시 시작해 주세요.",
  invalid_code: "소셜 로그인 요청이 만료됐습니다. 다시 시작해 주세요.",
  unable_to_link_account: "이 소셜 계정을 연결하지 못했습니다. 다른 모아 계정에 이미 연결됐는지 확인해 주세요.",
  account_already_linked_to_different_user: "이미 다른 모아 계정에 연결된 소셜 계정입니다. 계정을 자동으로 합치지 않습니다.",
};
export function socialErrorMessage(code: unknown) { return typeof code === "string" ? messages[code] : undefined; }

const authorizationTargets: Record<SocialProvider, { host: string; path: string }> = {
  google: { host: "accounts.google.com", path: "/o/oauth2/v2/auth" },
  naver: { host: "nid.naver.com", path: "/oauth2.0/authorize" },
  kakao: { host: "kauth.kakao.com", path: "/oauth/authorize" },
};

export async function beginSocialSignIn(form: FormData, headers: Headers, linking = false): Promise<{ state: AuthFormState; response?: Response; url?: string }> {
  const provider = z.enum(socialProviders).safeParse(form.get("provider"));
  if (!provider.success) return { state: { status: "error", message: "지원하지 않는 로그인 수단입니다." } };
  const intent = form.get("intent") === "signup" ? "signup" : "signin";
  try {
    const origin = new URL(String(getAuth().options.baseURL)).origin;
    const requestHeaders = new Headers(headers);
    requestHeaders.delete("content-length");
    requestHeaders.set("content-type", "application/json");
    const response = await handleAuthRequest(new Request(`${origin}/api/auth/${linking ? "link-social" : "sign-in/social"}`, { method: "POST", headers: requestHeaders, body: JSON.stringify({ provider: provider.data, ...linking ? {} : { intent } }) }));
    const data = z.object({ url: z.url().optional() }).safeParse(await response.clone().json());
    if (!response.ok || !data.success || !data.data.url) throw new Error("social-start-failed");
    const url = new URL(data.data.url);
    const expected = authorizationTargets[provider.data];
    if (url.protocol !== "https:" || url.hostname !== expected.host || url.port || url.username || url.password || url.hash
      || url.pathname !== expected.path || !url.searchParams.get("state")
      || url.searchParams.get("redirect_uri") !== `${origin}/api/auth/callback/${provider.data}`) throw new Error("social-target-invalid");
    return { state: { status: "success" }, response, url: url.href };
  } catch {
    return { state: { status: "error", message: "소셜 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." } };
  }
}

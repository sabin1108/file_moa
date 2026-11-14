import "server-only";

import { z } from "zod";
import type { AuthFieldName, AuthFormState, AuthOperation } from "../../shared/auth-contract";
import { getAuth } from "./auth";
import { handleAuthRequest } from "./auth-handler";
import { reportAuthenticationFailure } from "./auth-diagnostics";
import { displayNameSchema } from "../../shared/auth-profile";
import { AUTH_PASSWORD_LIMITS } from "../../shared/auth-contract";

const email = z.string().trim().max(254).pipe(z.email("올바른 이메일 주소를 입력해 주세요.")).transform(value => value.toLowerCase());
const password = z.string()
  .min(AUTH_PASSWORD_LIMITS.min, "비밀번호는 8자 이상 입력해 주세요.")
  .max(AUTH_PASSWORD_LIMITS.max, "비밀번호는 30자 이하로 입력해 주세요.");
const token = z.string().min(1, "메일의 링크를 다시 열어 주세요.").max(4096);
const confirmPassword = { message: "비밀번호가 일치하지 않습니다.", path: ["passwordConfirm"] };
const newPassword = z.object({ password, passwordConfirm: z.string() }).refine(
  value => value.password === value.passwordConfirm,
  confirmPassword
);
const schemas = {
  login: z.object({ email, password: z.string().min(1, "비밀번호를 입력해 주세요.").max(128) }),
  signup: z.object({ email, password, passwordConfirm: z.string() }).refine(
    value => value.password === value.passwordConfirm,
    confirmPassword
  ),
  profile: z.object({ name: displayNameSchema }),
  resend: z.object({ email }),
  "request-reset": z.object({ email }),
  verify: z.object({ token }),
  reset: newPassword.and(z.object({ token })),
  signout: z.object({}),
};

const paths: Record<AuthOperation, string> = {
  login: "/sign-in/email",
  signup: "/sign-up/email",
  resend: "/send-verification-email",
  profile: "/update-user",
  "request-reset": "/request-password-reset",
  verify: "/verify-email",
  reset: "/reset-password",
  signout: "/sign-out",
};

const successMessages: Record<AuthOperation, string> = {
  login: "로그인했습니다.",
  signup: "가입 요청을 처리했습니다. 이메일의 확인 링크를 열어 주세요.",
  profile: "표시 이름을 저장했습니다.",
  resend: "확인이 필요한 계정이라면 인증 메일을 보냅니다. 메일함을 확인해 주세요.",
  "request-reset": "해당 이메일로 가입한 계정이 있다면 재설정 메일을 보냅니다. 메일함을 확인해 주세요.",
  verify: "이메일 확인을 마쳤습니다. 이제 로그인할 수 있습니다.",
  reset: "비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.",
  signout: "로그아웃했습니다.",
};

const errorMessages: Record<string, string> = {
  INVALID_ORIGIN: "정식 서비스 주소에서 다시 시도해 주세요. 열린 화면을 새로고침해 주세요.",
  INVALID_CALLBACK_URL: "정식 서비스 주소에서 다시 시도해 주세요.",
  INVALID_EMAIL_OR_PASSWORD: "이메일 또는 비밀번호를 확인해 주세요.",
  EMAIL_NOT_VERIFIED: "먼저 이메일 확인을 마쳐 주세요. 가입 안내에서 인증 메일을 다시 요청할 수 있습니다.",
  INVALID_TOKEN: "유효하지 않거나 이미 사용한 링크입니다. 새 메일을 요청해 주세요.",
  TOKEN_EXPIRED: "링크의 유효 시간이 지났습니다. 새 메일을 요청해 주세요.",
};

export async function submitAuthForm(operation: AuthOperation, formData: FormData, headers: Headers): Promise<{
  state: AuthFormState;
  response?: Response
}> {
  const failureMessage = operation === "resend" || operation === "request-reset"
    ? "메일을 보내지 못했습니다. 계속 실패하면 서비스의 메일 발신 설정을 확인해야 합니다."
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  const parsed = schemas[operation].safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const fieldErrors: Partial<Record<AuthFieldName, string>> = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0];

      if (field === "name" || field === "email" || field === "password" || field === "passwordConfirm" || field === "token") {
        fieldErrors[field] ??= issue.message;
      }
    }

    return { state: { status: "error", message: "입력한 내용을 확인해 주세요.", fieldErrors } };
  }

  try {
    const baseURL = getAuth().options.baseURL;

    if (typeof baseURL !== "string") throw new Error("Authentication unavailable.");

    const origin = new URL(baseURL).origin;
    const body: Record<string, unknown> = { ...parsed.data };

    delete body.passwordConfirm;
    // Defer profile input until verified login, without deriving a public name from the email.

    if (operation === "signup") body.name = "";

    if (operation === "signup" || operation === "resend") body.callbackURL = `${origin}/login`;

    if (operation === "request-reset") body.redirectTo = `${origin}/reset-password`;

    if (operation === "reset") {
      body.newPassword = body.password;
      delete body.password;
    }

    const url = new URL(`/api/auth${paths[operation]}`, origin);
    const requestHeaders = new Headers(headers);

    requestHeaders.delete("content-length");
    requestHeaders.set("content-type", "application/json");

    const verify = operation === "verify";

    if (verify) url.searchParams.set("token", String(body.token));

    const response = await handleAuthRequest(new Request(url, {
      method: verify ? "GET" : "POST",
      headers: requestHeaders,
      body: verify ? undefined : JSON.stringify(body),
    }));

    if (!response.ok) {
      const error = z.object({ code: z.string().optional() }).safeParse(await response.clone().json());

      if (
        response.status >= 500
        ||
        (error.success &&
          ["INVALID_ORIGIN", "FAILED_TO_CREATE_USER"].includes(error.data.code ?? ""))
      )
        reportAuthenticationFailure("form", error.success ? error.data : undefined);

      const message = response.status === 429
        ? "요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요."
        : error.success ? errorMessages[error.data.code ?? ""] : undefined;

      return { response, state: { status: "error", message: message ?? failureMessage } };
    }

    return { response, state: { status: "success", message: successMessages[operation] } };
  } catch (error) {
    reportAuthenticationFailure("form", error);

    return { state: { status: "error", message: failureMessage } };
  }
}

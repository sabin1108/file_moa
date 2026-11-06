import "server-only";

import { z } from "zod";
import { getAuth } from "./auth";
import { socialProviders } from "../shared/social-auth";
import { reportAuthenticationFailure } from "./auth-diagnostics";

const postPaths = new Set([
  "/sign-up/email", "/sign-in/email", "/sign-out", "/send-verification-email",
  "/request-password-reset", "/reset-password",
  "/sign-in/social",
]);

export async function handleAuthRequest(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth(?=\/)/, "");
  const allowed = request.method === "POST" && postPaths.has(path)
    || request.method === "GET" && (path === "/get-session" || path === "/verify-email" || /^\/reset-password\/[\w-]+$/.test(path) || /^\/callback\/(google|naver|kakao)$/.test(path));

  if (!allowed) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404, headers: { "cache-control": "no-store" } });
  }

  try {
    if (path === "/sign-in/social") {
      const input = z.object({ provider: z.enum(socialProviders), intent: z.enum(["signin", "signup"]).default("signin") }).strict().safeParse(await request.clone().json().catch(() => null));
      if (!input.success) return Response.json({ code: "INVALID_SOCIAL_REQUEST" }, { status: 400, headers: { "cache-control": "no-store" } });
      const origin = new URL(String(getAuth().options.baseURL)).origin;
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      headers.set("content-type", "application/json");
      request = new Request(request.url, { method: "POST", headers, body: JSON.stringify({
        provider: input.data.provider, requestSignUp: input.data.intent === "signup", disableRedirect: true,
        callbackURL: `${origin}/`, newUserCallbackURL: `${origin}/`, errorCallbackURL: `${origin}/login`,
      }) });
    }
    const response = await getAuth().handler(request);
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.set("referrer-policy", "no-referrer");

    if (response.status >= 500) throw new Error("Authentication unavailable.");
    if (response.status >= 300 && response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) {
      return new Response(response.body, { status: response.status, headers });
    }

    const data = z.record(z.string(), z.unknown()).nullable().parse(await response.json());

    if (data) {
      delete data.token;

      if (data.session) {
        const session = z.record(z.string(), z.unknown()).parse(data.session);
        delete session.token;
        delete session.ipAddress;
        delete session.userAgent;
        data.session = session;
      }
    }

    headers.delete("content-length");

    return Response.json(data, { status: response.status, headers });
  } catch (error) {
    reportAuthenticationFailure("protocol", error);
    return Response.json({ code: "AUTHENTICATION_UNAVAILABLE", message: "인증 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, {
      status: 503,
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });
  }
}

import "server-only";
import { z } from "zod";
import type { AccountLoginSettings, AuthFormState } from "../shared/auth-contract";
import { socialProviders, type SocialProvider } from "../shared/social-auth";
import { getAuthenticatedSession } from "./authenticated-session";
import { getDatabase } from "./database/client";
import { getAuth } from "./auth";
import { socialProviderConfiguration } from "./social-providers";
import { beginSocialSignIn } from "./auth-social";
import { createAuthRateLimiter } from "./auth-rate-limit";

let limiter: ReturnType<typeof createAuthRateLimiter> | undefined;

function usableMethods(userId: string, enabledOnly = false) {
  const configured = socialProviderConfiguration();
  const providers = enabledOnly ? socialProviders.filter(provider => !!configured[provider]) : [...socialProviders];
  return { userId, OR: [{ providerId: { in: providers } }, { providerId: "credential", accountId: userId, password: { not: null } }] };
}

export async function readAccountLoginSettings(headers: Headers): Promise<AccountLoginSettings> {
  const session = await getAuthenticatedSession(headers);
  if (!session) throw new Error("로그인이 필요합니다.");
  const methods = await getDatabase().account.findMany({ where: usableMethods(session.user.id), select: { providerId: true } });
  const configured = socialProviderConfiguration();
  return {
    name: session.user.name, email: session.user.email, hasPassword: methods.some(method => method.providerId === "credential"),
    providers: socialProviders.map(id => ({ id, connected: methods.some(method => method.providerId === id), available: !!configured[id] })),
  };
}

async function unlink(userId: string, provider: SocialProvider): Promise<AuthFormState> {
  return getDatabase().$transaction(async transaction => {
    // All application unlink operations serialize per user so concurrent removals retain a login method.
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`moa-auth-methods:${userId}`}, 0))`;
    const remaining = await transaction.account.count({ where: { ...usableMethods(userId, true), NOT: { providerId: provider } } });
    if (!remaining) return { status: "error", message: "마지막 로그인 수단은 해제할 수 없습니다. 다른 소셜 계정을 먼저 연결해 주세요." };
    await transaction.account.deleteMany({ where: { userId, providerId: provider } });
    return { status: "success", message: "소셜 계정 연결을 해제했습니다." };
  });
}

export async function manageSocialAccount(data: FormData, headers: Headers): Promise<{ state: AuthFormState; response?: Response; url?: string }> {
  const input = z.object({ provider: z.enum(socialProviders), operation: z.enum(["link", "unlink"]) }).safeParse(Object.fromEntries(data));
  if (!input.success) return { state: { status: "error", message: "연결할 로그인 수단을 확인해 주세요." } };
  const origin = new URL(String(getAuth().options.baseURL)).origin;
  if (headers.get("origin") !== origin) return { state: { status: "error", message: "정식 서비스 화면에서 다시 시도해 주세요." } };
  const session = await getAuthenticatedSession(headers);
  if (!session) return { state: { status: "error", message: "로그인한 뒤 다시 시도해 주세요." } };
  if (Date.now() - session.session.createdAt.getTime() > 86_400_000) return { state: { status: "error", message: "로그인 수단을 변경하려면 계정 화면에서 로그아웃한 뒤 다시 로그인해 주세요." } };
  limiter ??= createAuthRateLimiter(getDatabase, process.env.BETTER_AUTH_SECRET!);
  if (!(await limiter.consume(`account-settings:${session.user.id}`, { window: 60, max: 10 })).allowed) return { state: { status: "error", message: "요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요." } };
  if (input.data.operation === "link") return beginSocialSignIn(data, headers, true);
  return { state: await unlink(session.user.id, input.data.provider) };
}

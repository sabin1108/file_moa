import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { after } from "next/server";
import { authenticationMailConfig, sendAuthenticationEmail } from "./auth-mail";
import { getDatabase } from "../database/client";
import { socialProviderConfiguration } from "./social-providers";
import { reportAuthenticationFailure } from "./auth-diagnostics";
import { createAuthRateLimiter } from "./auth-rate-limit";
import { socialProviders } from "../../shared/social-auth";
import { expireConnectedSettingsDisplay, expireSettingsDisplay } from "../settings/settings-cache-policy";
import { AUTH_PASSWORD_LIMITS } from "../../shared/auth-contract";

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  let origin: URL;

  try {
    origin = new URL(baseURL ?? "");
  } catch {
    throw new Error("BETTER_AUTH_URL must be a trusted application origin.");
  }

  const local = ["127.0.0.1", "localhost"].includes(origin.hostname);

  if ((origin.protocol !== "https:" && !(local && origin.protocol === "http:"))
    || origin.username || origin.password
    || origin.search
    || origin.hash
    || origin.pathname !== "/") {
    throw new Error("BETTER_AUTH_URL must be a trusted application origin.");
  }

  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }

  authenticationMailConfig();

  return betterAuth({
    database: prismaAdapter(getDatabase(), { provider: "postgresql", transaction: true }),
    secret,
    baseURL: origin.origin,
    trustedOrigins: [origin.origin],
    onAPIError: { errorURL: `${origin.origin}/login` },
    socialProviders: socialProviderConfiguration(),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: AUTH_PASSWORD_LIMITS.min,
      maxPasswordLength: AUTH_PASSWORD_LIMITS.max,
      resetPasswordTokenExpiresIn: 1_800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const credential = await getDatabase().account.findFirst({
          where: {
            userId: user.id,
            providerId: "credential",
            accountId: user.id,
            password: { not: null },
          },
          select: { id: true },
        });

        if (!credential) return;

        await sendAuthenticationEmail({
          to: user.email,
          subject: "모아 비밀번호 재설정",
          text: `아래 링크에서 비밀번호를 재설정하세요. 링크는 30분 동안 유효합니다.\n\n${url}\n\n요청하지 않았다면 이 메일을 무시하세요.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3_600,
      sendVerificationEmail: async ({ user, token }, request) => {
        if (request && /^\/api\/auth\/callback\/(google|naver|kakao)$/.test(new URL(request.url).pathname)) return;

        const url = new URL("/verify-email", origin.origin);

        url.searchParams.set("token", token);
        await sendAuthenticationEmail({
          to: user.email,
          subject: "모아 이메일 주소 확인",
          text: `아래 링크에서 이메일 주소를 확인하세요. 링크는 1시간 동안 유효합니다.\n\n${url}\n\n확인 후 직접 로그인해 주세요. 요청하지 않았다면 이 메일을 무시하세요.`,
        });
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: true,
        trustedProviders: [...socialProviders]
      },
    },
    session: { cookieCache: { enabled: false } },
    verification: { storeIdentifier: "hashed" },
    databaseHooks: {
      user: {
        update: {
          after: async () => {
            expireConnectedSettingsDisplay();
          }
        },
      },
      account: {
        // ID tokens are consumed during the callback; this app has no later use for them.
        create: {
          before: async account => {
            if (account.providerId === "credential"
              && await getDatabase().account.findFirst({
                where: { userId: account.userId, providerId: { in: [...socialProviders] } },
                select: { id: true },
              })) throw new Error("A social account requires explicit credential linking.");

            return { data: { ...account, idToken: null } };
          },
          after: async account => {
            expireSettingsDisplay(account.userId);
          },
        },
        update: {
          before: async account => ({ data: { ...account, idToken: null } }),
          after: async account => {
            expireSettingsDisplay(account.userId);
          },
        },
        delete: {
          after: async account => {
            expireSettingsDisplay(account.userId);
          }
        },
      },
      session: {
        create: {
          before: async session => ({ data: { ...session, ipAddress: null, userAgent: null } }),
          after: async session => {
            expireSettingsDisplay(session.userId);
          },
        },
        delete: {
          after: async session => {
            expireSettingsDisplay(session.userId);
          }
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customStorage: createAuthRateLimiter(getDatabase, secret),
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/social": { window: 60, max: 10 },
        "/link-social": { window: 60, max: 5 },
        "/delete-user": { window: 60, max: 3 },
        "/update-user": { window: 60, max: 10 },
        "/send-verification-email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] },
      backgroundTasks: {
        handler: task => {
          after(task.catch(() => {
            console.error("Authentication email delivery failed.");
          }));
        },
      },
    },
    logger: {
      level: "error",
      log: (level, ...values) => {
        if (level === "error") reportAuthenticationFailure("library", values);
      }
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  auth ??= createAuth();

  return auth;
}

import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { after } from "next/server";
import { authenticationMailConfig, sendAuthenticationEmail } from "./auth-mail";
import { getDatabase } from "./database/client";

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
    || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
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
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 1_800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
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
      sendVerificationEmail: async ({ user, token }) => {
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
      accountLinking: { enabled: false, disableImplicitLinking: true },
    },
    session: { cookieCache: { enabled: false } },
    verification: { storeIdentifier: "hashed" },
    databaseHooks: {
      session: {
        create: { before: async session => ({ data: { ...session, ipAddress: null, userAgent: null } }) },
      },
    },
    rateLimit: {
      enabled: true,
      // shortcut: counters are per process; use shared storage before a multi-instance public release.
      storage: "memory",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
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
          after(task.catch(() => { console.error("Authentication email delivery failed."); }));
        },
      },
    },
    logger: { disabled: true },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  auth ??= createAuth();

  return auth;
}

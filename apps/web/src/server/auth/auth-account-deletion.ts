import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthFormState } from "../../shared/auth-contract";
import { getAuth } from "./auth";
import { sendAuthenticationEmail } from "./auth-mail";
import { getAuthenticatedSession } from "./authenticated-session";
import { getDatabase } from "../database/client";
import { createAuthRateLimiter } from "./auth-rate-limit";
import { expireConnectedSettingsDisplay, expireSettingsDisplay } from "../settings/settings-cache-policy";

const deletionInput = z.object({ confirm: z.literal("on") }).strict();
const completionInput = z.object({ confirm: z.literal("on"), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const verificationValue = z.object({ userId: z.string().min(1), sessionId: z.string().min(1) }).strict();
const freshSessionAgeMs = 86_400_000;
const deletionTokenLifetimeMs = 1_800_000;
let limiter: ReturnType<typeof createAuthRateLimiter> | undefined;

type DeletionSession = {
  user: {
    id: string;
    email: string
  };
  session: {
    id: string;
    createdAt: Date
  }
};

function deletionIdentifier(token: string) {
  return `moa-delete:${createHash("sha256").update(token).digest("hex")}`;
}

function hasFreshSession(session: DeletionSession) {
  const createdAt = session.session.createdAt.getTime();
  const age = Date.now() - createdAt;

  return Number.isFinite(createdAt) && age >= 0 && age <= freshSessionAgeMs;
}

async function hasConnectedIdentity(database: ReturnType<typeof getDatabase>, userId: string) {
  const [membership, primary] = await Promise.all([
    database.loginConnectionMember.findUnique({ where: { userId }, select: { userId: true } }),
    database.loginConnection.findFirst({ where: { primaryOwnerUserId: userId }, select: { id: true } }),
  ]);

  return Boolean(membership || primary);
}

function failure(message: string): AuthFormState {
  return { status: "error", message };
}

export async function requestAccountDeletion(data: FormData, headers: Headers): Promise<AuthFormState> {
  if (!deletionInput.safeParse(Object.fromEntries(data)).success) return failure("계정 삭제 안내를 확인해 주세요.");

  const origin = new URL(String(getAuth().options.baseURL)).origin;

  if (headers.get("origin") !== origin) return failure("정식 서비스 화면에서 다시 시도해 주세요.");

  const session = await getAuthenticatedSession(headers);

  if (!session) return failure("로그인한 뒤 다시 시도해 주세요.");

  if (!hasFreshSession(session)) return failure("계정을 삭제하려면 로그아웃한 뒤 다시 로그인해 주세요.");

  const database = getDatabase();

  if (await hasConnectedIdentity(database, session.user.id)) {
    return failure("연결된 계정은 먼저 계정 연결을 해제한 뒤 삭제할 수 있습니다.");
  }

  limiter ??= createAuthRateLimiter(getDatabase, process.env.BETTER_AUTH_SECRET!);

  if (!(await limiter.consume(`account-delete:${session.user.id}`, { window: 60, max: 3 })).allowed) {
    return failure("요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.");
  }

  const token = randomBytes(32).toString("base64url");
  const url = new URL("/delete-account", origin);

  url.searchParams.set("token", token);
  await database.$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('moa.user_id', ${session.user.id}, true)`;
    await transaction.verification.create({
      data: {
        id: randomUUID(),
        identifier: deletionIdentifier(token),
        value: JSON.stringify({ userId: session.user.id, sessionId: session.session.id }),
        expiresAt: new Date(Date.now() + deletionTokenLifetimeMs),
      }
    });
  });
  await sendAuthenticationEmail({
    to: session.user.email,
    subject: "모아 계정 삭제 확인",
    text: `아래 링크를 열어 계정 삭제를 확인해 주세요. 링크를 연 브라우저에서도 같은 계정으로 로그인되어 있어야 합니다.\n\n${url}\n\n이 요청을 하지 않았다면 이 메일을 무시해 주세요.`,
  });

  return { status: "success", message: "계정 삭제 확인 메일을 보냈습니다. 메일의 링크를 열어 삭제를 마쳐 주세요." };
}

export async function finishAccountDeletion(data: FormData, headers: Headers): Promise<AuthFormState> {
  const input = completionInput.safeParse(Object.fromEntries(data));

  if (!input.success) return failure("계정 삭제 확인 정보를 다시 확인해 주세요.");

  const origin = new URL(String(getAuth().options.baseURL)).origin;

  if (headers.get("origin") !== origin) return failure("정식 서비스 화면에서 다시 시도해 주세요.");

  const session = await getAuthenticatedSession(headers);

  if (!session) return failure("확인 링크를 연 브라우저에서 같은 계정으로 로그인해 주세요.");

  if (!hasFreshSession(session)) return failure("계정을 삭제하려면 로그아웃한 뒤 다시 로그인해 주세요.");

  const identifier = deletionIdentifier(input.data.token);
  const completed = await getDatabase().$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('moa.user_id', ${session.user.id}, true)`;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`moa-auth-methods:${session.user.id}`}, 0))`;

    const currentSession = await transaction.session.findFirst({
      where: { id: session.session.id, userId: session.user.id, expiresAt: { gt: new Date() } },
      select: { id: true },
    });

    if (!currentSession) return false;

    const verification = await transaction.verification.findFirst({
      where: { identifier, expiresAt: { gt: new Date() } },
      select: { id: true, value: true },
    });
    let value: z.infer<typeof verificationValue> | undefined;

    try {
      const parsed = verificationValue.safeParse(verification?.value ? JSON.parse(verification.value) : null);

      if (parsed.success) value = parsed.data;
    } catch { }

    if (!verification || !value || value.userId !== session.user.id || value.sessionId !== session.session.id) return false;

    const [membership, primary] = await Promise.all([
      transaction.loginConnectionMember.findUnique({ where: { userId: session.user.id }, select: { userId: true } }),
      transaction.loginConnection.findFirst({ where: { primaryOwnerUserId: session.user.id }, select: { id: true } }),
    ]);

    if (membership || primary) return false;

    await transaction.verification.delete({ where: { id: verification.id } });
    await transaction.user.delete({ where: { id: session.user.id } });

    return true;
  });

  if (!completed) return failure("삭제를 확인하지 못했습니다. 계정 연결과 확인 링크 상태를 다시 확인해 주세요.");

  expireSettingsDisplay(session.user.id);
  expireConnectedSettingsDisplay();

  return { status: "success", message: "계정이 삭제되었습니다." };
}

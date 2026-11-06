import "server-only";

import { z } from "zod";
import type { AuthFormState, WorkspaceConnection } from "../shared/auth-contract";
import { socialProviders } from "../shared/social-auth";
import { getAuth } from "./auth";
import { getAuthenticatedSession } from "./authenticated-session";
import { getDatabase } from "./database/client";
import { createAuthRateLimiter } from "./auth-rate-limit";

const connectionInput = z.object({
  email: z.string().trim().max(254).pipe(z.email()).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(128), primary: z.enum(["current", "existing"]), confirm: z.literal("on"),
}).strict();
const failure: AuthFormState = { status: "error", message: "계정 정보를 확인해 주세요. 이메일 인증을 마친 기존 계정의 비밀번호가 필요합니다." };
let limiter: ReturnType<typeof createAuthRateLimiter> | undefined;

async function ensureOwnWorkspace(userId: string) {
  await getDatabase().$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('moa.user_id', ${userId}, true)`;
    await transaction.workspace.createMany({ data: [{ ownerUserId: userId }], skipDuplicates: true });
  });
}

async function authorize(headers: Headers) {
  if (headers.get("origin") !== new URL(String(getAuth().options.baseURL)).origin) return null;
  const session = await getAuthenticatedSession(headers);
  if (!session || Date.now() - session.session.createdAt.getTime() > 86_400_000) return null;
  limiter ??= createAuthRateLimiter(getDatabase, process.env.BETTER_AUTH_SECRET!);
  if (!(await limiter.consume(`account-connect:${session.user.id}`, { window: 60, max: 5 })).allowed) return null;
  return session;
}

export async function readWorkspaceConnection(headers: Headers): Promise<WorkspaceConnection | null> {
  const session = await getAuthenticatedSession(headers);
  if (!session) throw new Error("Authentication required.");
  const membership = await getDatabase().loginConnectionMember.findUnique({
    where: { userId: session.user.id },
    select: { connection: { select: { primaryOwnerUserId: true, members: { orderBy: { slot: "asc" }, select: { userId: true, user: { select: { name: true, email: true } } } } } } },
  });
  if (!membership) return null;
  return { primaryOwnerUserId: membership.connection.primaryOwnerUserId,
    members: membership.connection.members.map(member => ({ ownerUserId: member.userId, ...member.user })) };
}

export async function connectExistingAccount(data: FormData, headers: Headers): Promise<AuthFormState> {
  const input = connectionInput.safeParse({ email: data.get("email"), password: data.get("password"), primary: data.get("primary"), confirm: data.get("confirm") });
  if (!input.success) return { status: "error", message: "연결할 계정과 기본 작업 공간을 선택하고 안내를 확인해 주세요." };
  const source = await authorize(headers);
  if (!source) return { status: "error", message: "다시 로그인한 뒤 정식 서비스 화면에서 시도해 주세요." };
  const database = getDatabase();
  const methods = await database.account.findMany({ where: { userId: source.user.id }, select: { providerId: true } });
  if (!methods.length || methods.some(method => !socialProviders.some(provider => provider === method.providerId))) return failure;
  await ensureOwnWorkspace(source.user.id);
  const credential = await database.account.findFirst({ where: { providerId: "credential", password: { not: null }, user: { email: input.data.email, emailVerified: true } }, select: { id: true, userId: true, accountId: true, password: true } });
  let proofToken: string | undefined;
  try {
    const origin = new URL(String(getAuth().options.baseURL)).origin;
    const proofHeaders = new Headers(headers);
    proofHeaders.delete("content-length"); proofHeaders.delete("cookie"); proofHeaders.set("content-type", "application/json");
    // Use the HTTP handler so Better Auth's normal origin and password-attempt limits also apply.
    const response = await getAuth().handler(new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST", headers: proofHeaders, body: JSON.stringify({ email: input.data.email, password: input.data.password, rememberMe: false }),
    }));
    if (!response.ok) return failure;
    const proof = z.object({ token: z.string().min(1).max(512), user: z.object({ id: z.string() }) }).parse(await response.json());
    proofToken = proof.token;
    if (!credential || credential.accountId !== credential.userId || proof.user.id !== credential.userId || credential.userId === source.user.id) return failure;
    await ensureOwnWorkspace(proof.user.id);
    return await database.$transaction(async transaction => {
      await transaction.$executeRaw`SELECT set_config('moa.user_id', ${source.user.id}, true)`;
      const [result] = await transaction.$queryRaw<{ connected: boolean }[]>`SELECT moa_auth.connect_login_accounts(${source.session.id}, ${proof.token}, ${credential.password}, ${input.data.primary === "current"}) AS connected`;
      return result.connected ? { status: "success", message: "두 계정을 연결했습니다. 다시 로그인해 주세요." } : failure;
    });
  } finally {
    if (proofToken) await database.session.deleteMany({ where: { token: proofToken } });
  }
}

export async function selectConnectedWorkspace(data: FormData, headers: Headers): Promise<AuthFormState> {
  const input = z.object({ ownerUserId: z.string().min(1).max(128) }).strict().safeParse({ ownerUserId: data.get("ownerUserId") });
  if (!input.success) return failure;
  const session = await authorize(headers);
  if (!session) return { status: "error", message: "다시 로그인한 뒤 시도해 주세요." };
  const database = getDatabase();
  const membership = await database.loginConnectionMember.findUnique({ where: { userId: session.user.id }, include: { connection: { include: { members: true } } } });
  if (!membership || !membership.connection.members.some(member => member.userId === input.data.ownerUserId)) return failure;
  return database.$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('moa.user_id', ${session.user.id}, true)`;
    const [result] = await transaction.$queryRaw<{ selected: boolean }[]>`SELECT moa_auth.select_connected_workspace(${session.session.id}, ${input.data.ownerUserId}) AS selected`;
    return result.selected ? { status: "success", message: "기본 작업 공간을 변경했습니다. 다시 로그인해 주세요." } : failure;
  });
}

export async function disconnectAccountConnection(data: FormData, headers: Headers): Promise<AuthFormState> {
  if (data.get("confirm") !== "on") return { status: "error", message: "연결 해제 안내를 확인해 주세요." };
  const session = await authorize(headers);
  if (!session) return { status: "error", message: "다시 로그인한 뒤 시도해 주세요." };
  return getDatabase().$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('moa.user_id', ${session.user.id}, true)`;
    const [result] = await transaction.$queryRaw<{ disconnected: boolean }[]>`SELECT moa_auth.disconnect_login_accounts(${session.session.id}) AS disconnected`;
    return result.disconnected ? { status: "success", message: "계정 연결을 해제했습니다. 다시 로그인해 주세요." } : failure;
  });
}

import "server-only";
import { getAuthenticatedSession } from "./authenticated-session";
import { getWorkspaceForAuthenticatedUser } from "./workspace";
import { getDatabase } from "./database/client";
import { Prisma } from "../../generated/prisma/client";
import { socialProviders } from "../shared/social-auth";

/** A fresh Headers identity bypasses request memoization at every stream authorization check. */
export async function readChatSession(requestHeaders: Headers) {
  const freshHeaders = new Headers(requestHeaders);
  const session = await getAuthenticatedSession(freshHeaders);
  const expiresAt = session?.session.expiresAt.getTime();
  if (!session || !session.user.name.trim() || !expiresAt || expiresAt <= Date.now()) return null;
  const owner = await getWorkspaceForAuthenticatedUser(session.user.id);
  if (owner.sessionUserId !== session.user.id) return null;
  return { ...owner, sessionId: session.session.id, sessionToken: session.session.token, expiresAt };
}

type ChatSession = NonNullable<Awaited<ReturnType<typeof readChatSession>>>;

/** Keep every publication fresh without preparing a workspace or rereading the cookie protocol. */
export async function revalidateChatStream(snapshot: ChatSession): Promise<boolean> {
  if (snapshot.expiresAt <= Date.now()) return false;
  const rows = await getDatabase().$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('moa.user_id', ${snapshot.sessionUserId}, true)`;
    return transaction.$queryRaw<{ name: string }[]>`
      SELECT u.name
      FROM moa_auth.session s
      JOIN moa_auth."user" u ON u.id = s."userId"
      JOIN moa_app.workspace w ON w.id = ${snapshot.workspaceId} AND w."ownerUserId" = ${snapshot.userId}
      LEFT JOIN moa_auth.login_connection_member m ON m."userId" = s."userId"
      LEFT JOIN moa_auth.login_connection c ON c.id = m."connectionId"
      WHERE s.id = ${snapshot.sessionId}
        AND s.token = ${snapshot.sessionToken}
        AND s."userId" = ${snapshot.sessionUserId}
        AND s."expiresAt" > statement_timestamp()
        AND (u."emailVerified" OR EXISTS (
          SELECT 1 FROM moa_auth.account a
          WHERE a."userId" = u.id AND a."providerId" IN (${Prisma.join([...socialProviders])})
        ))
        AND (
          (m."userId" IS NULL AND s."userId" = ${snapshot.userId})
          OR (m."userId" IS NOT NULL AND c."primaryOwnerUserId" = ${snapshot.userId} AND EXISTS (
            SELECT 1 FROM moa_auth.login_connection_member owner
            WHERE owner."connectionId" = m."connectionId" AND owner."userId" = ${snapshot.userId}
          ))
        )`;
  });
  return rows.length === 1 && rows[0].name.trim().length > 0;
}

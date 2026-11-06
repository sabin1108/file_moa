import "server-only";

import { getAuth } from "./auth";
import { getDatabase } from "./database/client";

export async function getAuthenticatedWorkspace(headers: Headers) {
  const session = await getAuth().api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });

  if (!session || !session.user.emailVerified) {
    throw new Error("Authentication required.");
  }

  const userId = session.user.id;

  return getDatabase().$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('moa.user_id', ${userId}, true)`;

    // An empty Prisma upsert can race between its lookup and insert.
    await transaction.workspace.createMany({
      data: [{ ownerUserId: userId }],
      skipDuplicates: true,
    });

    const workspace = await transaction.workspace.findUniqueOrThrow({
      where: { ownerUserId: userId },
      select: { id: true, ownerUserId: true },
    });

    return { userId, workspaceId: workspace.id };
  });
}

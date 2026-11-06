import "server-only";

import { getAuthenticatedSession } from "./authenticated-session";
import { getDatabase } from "./database/client";

export async function getAuthenticatedWorkspace(headers: Headers) {
  const session = await getAuthenticatedSession(headers);

  if (!session) {
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

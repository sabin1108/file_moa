import "server-only";

import { getAuthenticatedSession } from "./authenticated-session";
import { getDatabase } from "./database/client";

export async function getAuthenticatedWorkspace(headers: Headers) {
  const session = await getAuthenticatedSession(headers);

  if (!session) {
    throw new Error("Authentication required.");
  }

  return getWorkspaceForAuthenticatedUser(session.user.id);
}

/** Called only after a fresh server session has authenticated this user. */

export async function getWorkspaceForAuthenticatedUser(userId: string) {

  return getDatabase().$transaction(async transaction => {
    await transaction.$executeRaw`SELECT set_config('moa.user_id', ${userId}, true)`;

    // An empty Prisma upsert can race between its lookup and insert.
    await transaction.workspace.createMany({
      data: [{ ownerUserId: userId }],
      skipDuplicates: true,
    });

    const membership = await transaction.loginConnectionMember.findUnique({ where: { userId }, include: { connection: { include: { members: true } } } });
    const selectedOwner = membership?.connection.primaryOwnerUserId ?? userId;

    if (membership && !membership.connection.members.some(member => member.userId === selectedOwner)) throw new Error("Workspace access unavailable.");

    const workspace = await transaction.workspace.findUniqueOrThrow({
      where: { ownerUserId: selectedOwner },
      select: { id: true, ownerUserId: true },
    });

    return { userId: workspace.ownerUserId, workspaceId: workspace.id, sessionUserId: userId };
  });
}

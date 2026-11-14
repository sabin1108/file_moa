import "server-only";
import { getAuth } from "./auth";
import { getAuthenticatedSession } from "./authenticated-session";
import { getDatabase } from "../database/client";

/** The conditional update lets only one tab claim the account's first guide. */
export async function claimWorkspaceGuide(headers: Headers): Promise<boolean> {
  if (headers.get("origin") !== new URL(String(getAuth().options.baseURL)).origin) return false;

  const session = await getAuthenticatedSession(headers);

  if (!session?.user.name.trim()) return false;

  const result = await getDatabase().user.updateMany({
    where: { id: session.user.id, workspaceGuideSeenAt: null },
    data: { workspaceGuideSeenAt: new Date() },
  });

  return result.count === 1;
}

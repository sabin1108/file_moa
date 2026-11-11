import "server-only";

import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { getAuthenticatedSession } from "./authenticated-session";
import { readAccountLoginSettingsForUser } from "./auth-account";
import { readWorkspaceConnectionForUser } from "./auth-account-connection";
import { settingsConnectionsTag, settingsDisplayTag } from "./settings-cache-policy";

export async function readSettingsDisplay(headers: Headers) {
  const session = await getAuthenticatedSession(headers);

  if (!session) throw new Error("로그인이 필요합니다.");

  const userId = session.user.id;
  // A new login must not reuse an older login's connection data if expiry failed.
  const login = createHash("sha256").update(session.session.id).digest("hex");

  return unstable_cache(async () => {
    const [account, connection] = await Promise.all([
      readAccountLoginSettingsForUser(userId),
      readWorkspaceConnectionForUser(userId),
    ]);

    return { account, connection };
  }, ["settings-display-v2", userId, login], {
    revalidate: 60,
    tags: [settingsDisplayTag(userId), settingsConnectionsTag],
  })();
}

export async function prepareSettingsDisplay(headers: Headers) {
  try {
    await readSettingsDisplay(headers);
  } catch {
    console.error("Settings display preparation failed.");
  }
}

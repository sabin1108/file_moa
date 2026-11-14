import "server-only";
import { cache } from "react";
import { getAuth } from "./auth";
import { getDatabase } from "../database/client";
import { socialProviders } from "../../shared/social-auth";

// React memoizes only within one server render; subsequent requests read the session again.

export const getAuthenticatedSession = cache(async (headers: Headers) => {
  const session = await getAuth().api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });

  if (!session || session.user.emailVerified) return session;

  const socialAccount = await getDatabase().account.findFirst({
    where: { userId: session.user.id, providerId: { in: [...socialProviders] } },
    select: { id: true },
  });

  return socialAccount ? session : null;
});

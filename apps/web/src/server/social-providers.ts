import "server-only";
import type { BetterAuthOptions } from "better-auth";
import type { SocialProvider } from "../shared/social-auth";

export function socialProviderConfiguration(environment: Record<string, string | undefined> = process.env) {
  const config: Pick<NonNullable<BetterAuthOptions["socialProviders"]>, SocialProvider> = {};
  const credentials = (prefix: string) => {
    const clientId = environment[`${prefix}_CLIENT_ID`]?.trim();
    const clientSecret = environment[`${prefix}_CLIENT_SECRET`]?.trim();

    return clientId && clientSecret
      ? { clientId, clientSecret, requireEmailVerification: false, disableImplicitSignUp: true }
      : undefined;
  };
  const google = credentials("GOOGLE");
  const naver = credentials("NAVER");
  // Kakao enrollment is paused; saved account IDs remain recognized separately.

  if (google) config.google = google;

  if (naver) config.naver = naver;

  return config;
}

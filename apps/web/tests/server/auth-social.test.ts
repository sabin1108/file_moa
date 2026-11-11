import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const protocol = vi.hoisted(() => vi.fn());

vi.mock("../../src/server/auth-handler", () => ({ handleAuthRequest: protocol }));
vi.mock(
  "../../src/server/auth",
  () => ({ getAuth: () => ({ options: { baseURL: "https://app.example.invalid" } }) })
);

import { beginSocialSignIn, socialErrorMessage } from "../../src/server/auth-social";
import { socialProviderConfiguration } from "../../src/server/social-providers";

beforeEach(() => {
  protocol.mockReset();
});
describe("social authentication trust boundary", () => {
  it("keeps Kakao disabled even with stored credentials while Google and Naver remain available", () => {
    const config = socialProviderConfiguration({
      GOOGLE_CLIENT_ID: "fixture-google",
      GOOGLE_CLIENT_SECRET: "fixture-secret",
      NAVER_CLIENT_ID: "fixture-naver",
      NAVER_CLIENT_SECRET: "fixture-secret",
      KAKAO_CLIENT_ID: "fixture-kakao",
      KAKAO_CLIENT_SECRET: "fixture-secret"
    });

    expect(Object.keys(config).sort()).toEqual(["google", "naver"]);
    expect(config.kakao).toBeUndefined();
  });
  it("uses provider identity without forcing email/password registration or app email verification", () => {
    const config = socialProviderConfiguration({
      GOOGLE_CLIENT_ID: "fixture-id",
      GOOGLE_CLIENT_SECRET: "fixture-secret",
      NAVER_CLIENT_ID: "incomplete"
    });

    expect(config).toMatchObject({
      google: {
        clientId: "fixture-id",
        clientSecret: "fixture-secret",
        requireEmailVerification: false,
        disableImplicitSignUp: true
      }
    });
    expect(config.naver).toBeUndefined();
    expect(config.kakao).toBeUndefined();
  });
  it("rejects unlisted providers without touching OAuth", async () => {
    const form = new FormData();

    form.set("provider", "attacker");
    expect((await beginSocialSignIn(form, new Headers())).state.status).toBe("error");
    expect(protocol).not.toHaveBeenCalled();
  });
  it("accepts a provider authorization URL only with an exact callback and state", async () => {
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    target.searchParams.set("state", "fixture-oauth-state");
    target.searchParams.set("redirect_uri", "https://app.example.invalid/api/auth/callback/google");
    protocol.mockResolvedValue(Response.json({ url: target.href }));

    const form = new FormData();

    form.set("provider", "google");
    form.set("callbackURL", "https://attacker.example.invalid");

    const result = await beginSocialSignIn(form, new Headers({ origin: "https://app.example.invalid" }));

    expect(result.url).toBe(target.href);
    expect(await (protocol.mock.calls[0][0] as Request).json()).toEqual({ provider: "google", intent: "signin" });
  });
  it.each(["access_token", "refresh_token", "id_token", "client_secret", "oauth_token", "code", "ACCESS_TOKEN"])("does not forward %s in a login or account-link authorization URL", async parameter => {
    for (const provider of ["google", "naver"] as const) {
      for (const linking of [false, true]) {
        const target = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://nid.naver.com/oauth2.0/authorize");

        target.searchParams.set("state", "fixture-oauth-state");
        target.searchParams.set("redirect_uri", `https://app.example.invalid/api/auth/callback/${provider}`);
        target.searchParams.set(parameter, "fixture-private-value");
        protocol.mockResolvedValue(Response.json({ url: target.href }));

        const form = new FormData();

        form.set("provider", provider);

        const result = await beginSocialSignIn(form, new Headers(), linking);

        expect(result.state.status).toBe("error");
        expect(result.url).toBeUndefined();
        expect(result.response).toBeUndefined();
        expect(JSON.stringify(result)).not.toContain("fixture-private-value");
      }
    }
  });
  it.each(["google", "naver"] as const)("keeps %s authorization and account linking available without credentials in the URL", async provider => {
    const target = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://nid.naver.com/oauth2.0/authorize");

    target.searchParams.set("state", "fixture-oauth-state");
    target.searchParams.set("redirect_uri", `https://app.example.invalid/api/auth/callback/${provider}`);
    target.searchParams.set("client_id", "fixture-public-id");
    target.searchParams.set("response_type", "code");
    target.searchParams.set("code_challenge", "fixture-public-challenge");
    protocol.mockResolvedValue(Response.json({ url: target.href }));

    const form = new FormData();

    form.set("provider", provider);

    for (const linking of [false, true]) {
      expect((await beginSocialSignIn(form, new Headers(), linking)).url).toBe(target.href);
    }
  });
  it.each(["https://evil.example.invalid/auth", "http://accounts.google.com/o/oauth2/v2/auth", "https://accounts.google.com/other?state=x", "https://accounts.google.com/o/oauth2/v2/auth?state=x&redirect_uri=https://evil.example.invalid"])("does not navigate to an unexpected authorization target", async url => {
    protocol.mockResolvedValue(Response.json({ url }));

    const form = new FormData();

    form.set("provider", "google");
    expect((await beginSocialSignIn(form, new Headers())).url).toBeUndefined();
  });
  it("does not echo unknown callback errors", () => {
    expect(socialErrorMessage("private-token-or-provider-message")).toBeUndefined();
    expect(socialErrorMessage("account_not_linked")).toContain("기존");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ session: vi.fn(), account: vi.fn(), connection: vi.fn(), cached: vi.fn(), expired: vi.fn() }));

vi.mock(
  "../../src/server/authenticated-session",
  () => ({ getAuthenticatedSession: calls.session })
);
vi.mock("../../src/server/auth-account", () => ({ readAccountLoginSettingsForUser: calls.account }));
vi.mock(
  "../../src/server/auth-account-connection",
  () => ({ readWorkspaceConnectionForUser: calls.connection })
);
vi.mock("next/cache", () => ({
  unstable_cache: (read: () => Promise<unknown>, keys: string[], options: unknown) => {
    calls.cached(keys, options);

    return read;
  },
  revalidateTag: calls.expired,
}));

import { prepareSettingsDisplay, readSettingsDisplay } from "../../src/server/settings-display";
import { expireConnectedSettingsDisplay, expireSettingsDisplay } from "../../src/server/settings-cache-policy";

const account = { name: "사용자", email: "reader@example.invalid", hasPassword: true, providers: [] };

beforeEach(() => {
  vi.resetAllMocks();
  calls.session.mockResolvedValue({
    user: { id: "user-a", name: account.name, email: account.email },
    session: { id: "session-a", token: "private-token" }
  });
  calls.account.mockResolvedValue(account);
  calls.connection.mockResolvedValue(null);
});

describe("settings display cache boundary", () => {
  it("authenticates before accessing a display cache", async () => {
    calls.session.mockResolvedValue(null);
    await expect(readSettingsDisplay(new Headers())).rejects.toThrow();
    expect(calls.cached).not.toHaveBeenCalled();
    expect(calls.account).not.toHaveBeenCalled();
  });

  it("caches only the existing display DTO under server identity", async () => {
    const requestHeaders = new Headers({ cookie: "private-cookie" });

    expect(await readSettingsDisplay(requestHeaders)).toEqual({ account, connection: null });
    expect(calls.session).toHaveBeenCalledWith(requestHeaders);
    expect(calls.account).toHaveBeenCalledWith("user-a");
    expect(calls.connection).toHaveBeenCalledWith("user-a");
    expect(calls.cached).toHaveBeenCalledWith(["settings-display-v2", "user-a", expect.any(String)], {
      revalidate: 60,
      tags: ["settings-display:user-a", "settings-display:connections"],
    });
    expect(JSON.stringify(calls.cached.mock.calls)).not.toMatch(/private|reader@|session-a/);
  });

  it("uses a different cache identity after an account switch", async () => {
    await readSettingsDisplay(new Headers());
    calls.session.mockResolvedValue({
      user: { id: "user-b", name: "다른 사용자", email: "other@example.invalid" },
      session: { id: "session-b" }
    });
    await readSettingsDisplay(new Headers());
    expect(calls.cached.mock.calls.map(([keys]) => keys[1])).toEqual(["user-a", "user-b"]);
    expect(calls.session).toHaveBeenCalledTimes(2);
  });

  it("does not turn failed settings reads into empty successful data", async () => {
    calls.connection.mockRejectedValue(new Error("fixture-db-failed"));
    await expect(readSettingsDisplay(new Headers())).rejects.toThrow("fixture-db-failed");
  });

  it("does not prevent the workspace opening when optional preparation fails", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => { });

    calls.account.mockRejectedValue(new Error("private-db-error"));
    await expect(prepareSettingsDisplay(new Headers())).resolves.toBeUndefined();
    expect(diagnostic).toHaveBeenCalledWith("Settings display preparation failed.");
    diagnostic.mockRestore();
  });

  it("expires a user or both sides of a connection without exposing tokens", () => {
    expireSettingsDisplay("user-a");
    expireConnectedSettingsDisplay();
    expect(calls.expired.mock.calls).toEqual([
      ["settings-display:user-a", { expire: 0 }],
      ["settings-display:connections", { expire: 0 }],
    ]);
  });

  it("does not undo a committed mutation if cache expiry is unavailable", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => { });

    calls.expired.mockImplementation(() => {
      throw new Error("private-cache-error");
    });
    expect(() => expireSettingsDisplay("user-a")).not.toThrow();
    expect(diagnostic).toHaveBeenCalledWith("Settings display invalidation failed.");
    diagnostic.mockRestore();
  });
});

import "next/dist/server/node-environment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import { nodeFs } from "next/dist/server/lib/node-fs-methods";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ session: vi.fn(), account: vi.fn(), connection: vi.fn() }));
vi.mock("../../src/server/authenticated-session", () => ({ getAuthenticatedSession: calls.session }));
vi.mock("../../src/server/auth-account", () => ({ readAccountLoginSettingsForUser: calls.account }));
vi.mock("../../src/server/auth-account-connection", () => ({ readWorkspaceConnectionForUser: calls.connection }));

import { prepareSettingsDisplay, readSettingsDisplay } from "../../src/server/settings-display";
import { settingsDisplayTag } from "../../src/server/settings-cache-policy";

const preview = { previewModeId: "fixture", previewModeEncryptionKey: "fixture", previewModeSigningKey: "fixture" };
let cache: IncrementalCache;
let sequence = 0;
let userId: string;
let loginId: string;

beforeEach(() => {
  vi.resetAllMocks();
  userId = `settings-runtime-${++sequence}`;
  loginId = `login-${sequence}`;
  cache = new IncrementalCache({
    dev: false, requestHeaders: {}, fs: nodeFs, flushToDisk: false,
    serverDistDir: `${process.cwd()}/.omx/settings-cache-fixture`, maxMemoryCacheSize: 1024 * 1024,
    previewProps: preview,
    prerenderManifest: { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview },
  });
  vi.stubGlobal("__incrementalCache", cache);
  calls.session.mockImplementation(async () => ({ user: { id: userId }, session: { id: loginId, token: "private-token" } }));
  calls.account.mockResolvedValue({ name: "사용자", email: "fixture@example.invalid", hasPassword: true, providers: [] });
  calls.connection.mockResolvedValue(null);
});

afterEach(() => { vi.unstubAllGlobals(); });

// The real Next Data Cache uses its filesystem handler in memory; DB and auth are fixtures.
describe("Next Data Cache settings integration", () => {
  it("reuses preparation across requests while authenticating every read", async () => {
    await prepareSettingsDisplay(new Headers());
    const settings = await readSettingsDisplay(new Headers());
    expect(settings.account.hasPassword).toBe(true);
    expect(calls.session).toHaveBeenCalledTimes(2);
    expect(calls.account).toHaveBeenCalledOnce();
    expect(calls.connection).toHaveBeenCalledOnce();
    expect(JSON.stringify(settings)).not.toMatch(/token|session|cookie/);
  });

  it("keeps another user out of an existing cache entry", async () => {
    const firstUserId = userId;
    await readSettingsDisplay(new Headers());
    userId = "settings-runtime-another-user";
    await readSettingsDisplay(new Headers());
    expect(calls.account).toHaveBeenCalledTimes(2);
    expect(calls.account.mock.calls.map(([id]) => id)).toEqual([firstUserId, userId]);
  });

  it("reloads changed display data after its actual Next cache tag expires", async () => {
    await readSettingsDisplay(new Headers());
    calls.account.mockResolvedValue({ name: "사용자", email: "fixture@example.invalid", hasPassword: false, providers: [] });
    // Next compares high-resolution tag times with millisecond entry timestamps.
    await new Promise(resolve => setTimeout(resolve, 10));
    await cache.revalidateTag(settingsDisplayTag(userId), { expire: 0 });
    const settings = await readSettingsDisplay(new Headers());
    expect(settings.account.hasPassword).toBe(false);
    expect(calls.account).toHaveBeenCalledTimes(2);
  });

  it("does not return cached settings after authentication is revoked", async () => {
    await readSettingsDisplay(new Headers());
    calls.session.mockResolvedValue(null);
    await expect(readSettingsDisplay(new Headers())).rejects.toThrow("로그인이 필요합니다.");
    expect(calls.account).toHaveBeenCalledOnce();
  });

  it("does not reuse former connection data for a new login even without tag expiry", async () => {
    calls.connection.mockResolvedValue({ primaryOwnerUserId: "former-peer", members: [] });
    await readSettingsDisplay(new Headers());
    calls.connection.mockResolvedValue(null);
    loginId = "a-new-login-after-disconnect";
    expect((await readSettingsDisplay(new Headers())).connection).toBeNull();
    expect(calls.connection).toHaveBeenCalledTimes(2);
  });
});

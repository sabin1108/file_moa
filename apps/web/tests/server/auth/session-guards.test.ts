import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ headers: vi.fn(), session: vi.fn(), workspace: vi.fn(), redirect: vi.fn(), social: vi.fn() }));

vi.mock(
  "../../../src/server/database/client",
  () => ({ getDatabase: () => ({ account: { findFirst: calls.social } }) })
);
vi.mock("next/headers", () => ({ headers: calls.headers }));
vi.mock("next/navigation", () => ({ redirect: calls.redirect }));
vi.mock(
  "../../../src/server/auth/auth",
  () => ({ getAuth: () => ({ api: { getSession: calls.session } }) })
);
vi.mock("../../../src/server/auth/workspace", () => ({ getAuthenticatedWorkspace: calls.workspace }));

import { requireGuest, requireWorkspace } from "../../../src/server/auth/session-guards";

beforeEach(() => {
  vi.resetAllMocks();
  calls.headers.mockResolvedValue(new Headers());
  calls.social.mockResolvedValue(null);
  calls.redirect.mockImplementation((path: string) => {
    throw new Error(`fixture-redirect:${path}`);
  });
});

describe("server route session guards", () => {
  it("requires a name only after authentication and before opening a workspace", async () => {
    calls.session.mockResolvedValue({
      user: { id: "user-a", name: "", emailVerified: true },
      session: { expiresAt: new Date("2027-01-01") }
    });
    await expect(requireWorkspace()).rejects.toThrow("fixture-redirect:/account");
    expect(calls.workspace).not.toHaveBeenCalled();
  });
  it("sends an authenticated verified guest-page visitor to the fixed workspace route", async () => {
    calls.session.mockResolvedValue({ user: { id: "user-a", emailVerified: true } });
    await expect(requireGuest()).rejects.toThrow("fixture-redirect:/");
    expect(calls.workspace).not.toHaveBeenCalled();
  });

  it.each([null])("allows only a guest on authentication pages", async session => {
    calls.session.mockResolvedValue(session);
    await expect(requireGuest()).resolves.toBeUndefined();
  });

  it("does not send an authenticated social user back to email verification", async () => {
    calls.session.mockResolvedValue({
      user: { id: "user-a", name: "소셜 사용자", emailVerified: false },
      session: { expiresAt: new Date("2027-01-01") }
    });
    calls.social.mockResolvedValue({ id: "social-a" });
    calls.workspace.mockResolvedValue({ userId: "user-a", workspaceId: "workspace-a" });
    await expect(requireWorkspace()).resolves.toMatchObject({ userId: "user-a" });
    await expect(requireGuest()).rejects.toThrow("fixture-redirect:/");
  });

  it("does not read authentication before the request-time boundary", async () => {
    calls.headers.mockRejectedValue(new Error("fixture-request-required"));
    await expect(requireGuest()).rejects.toThrow("fixture-request-required");
    expect(calls.session).not.toHaveBeenCalled();
  });

  it("does not turn an authentication outage into access", async () => {
    calls.session.mockRejectedValue(new Error("fixture-unavailable"));
    await expect(requireGuest()).rejects.toThrow("로그인 상태를 확인하지 못했습니다.");
  });

  it("redirects a missing workspace session without mounting an owner", async () => {
    calls.session.mockResolvedValue(null);
    await expect(requireWorkspace()).rejects.toThrow("fixture-redirect:/login");
    expect(calls.workspace).not.toHaveBeenCalled();
  });

  it("uses only the authenticated server workspace identity", async () => {
    calls.session.mockResolvedValue({
      user: { id: "user-a", name: "기존 사용자", emailVerified: true },
      session: { expiresAt: new Date("2027-01-01") }
    });
    calls.workspace.mockResolvedValue({ userId: "user-a", workspaceId: "workspace-a" });
    await expect(requireWorkspace()).resolves.toMatchObject({ userId: "user-a", workspaceId: "workspace-a" });
  });
});

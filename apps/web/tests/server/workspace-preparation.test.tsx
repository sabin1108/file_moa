import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ guard: vi.fn(), headers: vi.fn(), after: vi.fn(), prepare: vi.fn() }));
vi.mock("next/headers", () => ({ headers: calls.headers }));
vi.mock("next/server", () => ({ after: calls.after }));
vi.mock("../../src/server/session-guards", () => ({ requireWorkspace: calls.guard }));
vi.mock("../../src/server/settings-display", () => ({ prepareSettingsDisplay: calls.prepare }));
vi.mock("../../src/app/actions/auth", () => ({ checkAuthSessionAction: vi.fn() }));
vi.mock("../../src/features/auth/components/SessionBoundary", () => ({ SessionBoundary: "session-boundary" }));
vi.mock("../../src/features/local-folders/providers/SourceFolderProvider", () => ({ SourceFolderProvider: "source-folder-provider" }));

import WorkspaceLayout from "../../src/app/(workspace)/layout";
import { Suspense } from "react";

const owner = { userId: "owner-a", workspaceId: "workspace-a", sessionUserId: "user-a", sessionExpiresAt: "2027-01-01T00:00:00.000Z" };
const requestHeaders = new Headers({ "x-fixture": "request-a" });

beforeEach(() => {
  vi.resetAllMocks();
  calls.guard.mockResolvedValue(owner);
  calls.headers.mockResolvedValue(requestHeaders);
});

describe("workspace response before optional settings preparation", () => {
  const renderAuthenticated = async (children: string) => {
    const boundary = WorkspaceLayout({ children });
    return boundary.props.children.type(boundary.props.children.props);
  };

  it("returns only a public shell without starting the authentication work", () => {
    const boundary = WorkspaceLayout({ children: "private-screen" });
    expect(boundary.type).toBe(Suspense);
    expect(JSON.stringify(boundary.props.fallback)).not.toContain("private-screen");
    expect(calls.guard).not.toHaveBeenCalled();
    expect(calls.after).not.toHaveBeenCalled();
  });

  it("returns the authenticated owner boundary before starting preparation", async () => {
    const view = await renderAuthenticated("main-screen");

    expect(calls.after).toHaveBeenCalledOnce();
    expect(calls.prepare).not.toHaveBeenCalled();
    expect(view.props.userId).toBe("user-a");
    expect(view.props.children.props.owner).toEqual({ userId: "owner-a", workspaceId: "workspace-a" });
    expect(view.props.children.props.children.props.children).toBe("main-screen");

    await calls.after.mock.calls[0][0]();
    expect(calls.prepare).toHaveBeenCalledWith(requestHeaders);
    expect(calls.headers).toHaveBeenCalledOnce();
  });

  it("does not wait for slow preparation to return the main screen", async () => {
    let complete!: () => void;
    calls.prepare.mockReturnValue(new Promise<void>(resolve => { complete = resolve; }));
    try {
      const view = await renderAuthenticated("usable-main-screen");
      expect(view.props.children.props.children.props.children).toBe("usable-main-screen");
      const preparation = calls.after.mock.calls[0][0]();
      expect(calls.prepare).toHaveBeenCalledOnce();
      complete();
      await preparation;
    } finally {
      complete();
    }
  }, 500);

  it("does not return private content or schedule preparation when the guard rejects", async () => {
    calls.guard.mockRejectedValue(new Error("fixture-login-required"));
    await expect(renderAuthenticated("private-screen")).rejects.toThrow("fixture-login-required");
    expect(calls.headers).not.toHaveBeenCalled();
    expect(calls.after).not.toHaveBeenCalled();
    expect(calls.prepare).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authenticated = vi.hoisted(() => vi.fn());
const workspace = vi.hoisted(() => vi.fn());

vi.mock(
  "../../../src/server/auth/authenticated-session",
  () => ({ getAuthenticatedSession: authenticated })
);
vi.mock("../../../src/server/auth/workspace", () => ({ getWorkspaceForAuthenticatedUser: workspace }));

import { readChatSession } from "../../../src/server/chat/chat-session";

describe("GC-006 fresh stream authorization", () => {
  it("uses a new memoization identity for each check, preserving request headers", async () => {
    authenticated.mockResolvedValue({
      user: { id: "A", name: "이름" },
      session: { id: "session-A", token: "fixture-token", expiresAt: new Date(Date.now() + 60_000) }
    });
    workspace.mockResolvedValue({ userId: "A", workspaceId: "workspace-A", sessionUserId: "A" });

    const headers = new Headers({ cookie: "fixture-session-only" });

    expect(await readChatSession(headers)).toMatchObject({ sessionId: "session-A", sessionToken: "fixture-token", workspaceId: "workspace-A" });
    await readChatSession(headers);

    const first = authenticated.mock.calls[0][0];
    const second = authenticated.mock.calls[1][0];

    expect(first).not.toBe(headers);
    expect(second).not.toBe(first);
    expect(first.get("cookie")).toBe("fixture-session-only");
    expect(workspace.mock.calls[0][0]).toBe("A");
    expect(workspace.mock.calls[1][0]).toBe("A");
    workspace.mockResolvedValue({ userId: "A", workspaceId: "workspace-A", sessionUserId: "B" });
    expect(await readChatSession(headers)).toBeNull();
  });
});

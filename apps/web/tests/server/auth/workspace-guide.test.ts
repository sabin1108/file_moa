import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ session: vi.fn(), update: vi.fn() }));
vi.mock("../../../src/server/auth/authenticated-session", () => ({ getAuthenticatedSession: calls.session }));
vi.mock("../../../src/server/auth/auth", () => ({ getAuth: () => ({ options: { baseURL: "https://moa.example.invalid" } }) }));
vi.mock("../../../src/server/database/client", () => ({ getDatabase: () => ({ user: { updateMany: calls.update } }) }));

import { claimWorkspaceGuide } from "../../../src/server/auth/workspace-guide";

const headers = () => new Headers({ origin: "https://moa.example.invalid" });

beforeEach(() => {
  vi.resetAllMocks();
  calls.session.mockResolvedValue({ user: { id: "signed-in-user", name: "모아 사용자" } });
  calls.update.mockResolvedValue({ count: 1 });
});

describe("account first-use guide", () => {
  it("claims only the signed-in account with an atomic unset condition", async () => {
    expect(await claimWorkspaceGuide(headers())).toBe(true);
    expect(calls.update).toHaveBeenCalledWith({
      where: { id: "signed-in-user", workspaceGuideSeenAt: null },
      data: { workspaceGuideSeenAt: expect.any(Date) },
    });
  });

  it("does not show again after another login, device or competing tab already claimed it", async () => {
    calls.update.mockResolvedValue({ count: 0 });
    expect(await claimWorkspaceGuide(headers())).toBe(false);
  });

  it.each([undefined, "https://foreign.example.invalid"])("rejects an untrusted origin %s", async origin => {
    const request = new Headers();
    if (origin) request.set("origin", origin);
    expect(await claimWorkspaceGuide(request)).toBe(false);
    expect(calls.session).not.toHaveBeenCalled();
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("does not mutate an anonymous account", async () => {
    calls.session.mockResolvedValue(null);
    expect(await claimWorkspaceGuide(headers())).toBe(false);
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("waits until the account profile is ready", async () => {
    calls.session.mockResolvedValue({ user: { id: "signed-in-user", name: " " } });
    expect(await claimWorkspaceGuide(headers())).toBe(false);
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("keeps a failed write distinguishable from a successful first claim", async () => {
    calls.update.mockRejectedValue(new Error("database unavailable"));
    await expect(claimWorkspaceGuide(headers())).rejects.toThrow("database unavailable");
  });
});

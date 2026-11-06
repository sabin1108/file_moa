import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ session: vi.fn(), database: vi.fn(), consume: vi.fn() }));
vi.mock("../../src/server/authenticated-session", () => ({ getAuthenticatedSession: calls.session }));
vi.mock("../../src/server/database/client", () => ({ getDatabase: calls.database }));
vi.mock("../../src/server/auth", () => ({ getAuth: () => ({ options: { baseURL: "https://moa.example.invalid" } }) }));
vi.mock("../../src/server/auth-rate-limit", () => ({ createAuthRateLimiter: () => ({ consume: calls.consume }) }));
import { connectExistingAccount, selectConnectedWorkspace, disconnectAccountConnection } from "../../src/server/auth-account-connection";

function connectionForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ email: "native@example.invalid", password: "fixture-password", primary: "current", confirm: "on" })) form.set(key, value);
  return form;
}
const headers = () => new Headers({ origin: "https://moa.example.invalid" });

beforeEach(() => { vi.resetAllMocks(); calls.consume.mockResolvedValue({ allowed: true }); });

describe("existing account connection trust boundaries", () => {
  it("rejects absent explicit consent before authentication or database work", async () => {
    const form = connectionForm(); form.delete("confirm");
    expect((await connectExistingAccount(form, headers())).status).toBe("error");
    expect(calls.database).not.toHaveBeenCalled(); expect(calls.session).not.toHaveBeenCalled();
  });
  it("rejects an unapproved workspace selector", async () => {
    const form = connectionForm(); form.set("primary", "attacker");
    expect((await connectExistingAccount(form, headers())).status).toBe("error");
    expect(calls.database).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests before reading a session", async () => {
    expect((await connectExistingAccount(connectionForm(), new Headers({ origin: "https://attacker.example.invalid" }))).status).toBe("error");
    expect(calls.session).not.toHaveBeenCalled(); expect(calls.database).not.toHaveBeenCalled();
  });
  it("rejects a missing session without attempting a native password proof", async () => {
    calls.session.mockResolvedValue(null);
    expect((await connectExistingAccount(connectionForm(), headers())).status).toBe("error");
    expect(calls.database).not.toHaveBeenCalled();
  });
  it("requires recent authentication before expanding access", async () => {
    calls.session.mockResolvedValue({ user: { id: "source" }, session: { createdAt: new Date(0) } });
    expect((await connectExistingAccount(connectionForm(), headers())).status).toBe("error");
    expect(calls.database).not.toHaveBeenCalled();
  });
  it("does not accept a forged workspace id as membership proof", async () => {
    const form = new FormData(); form.set("ownerUserId", "attacker");
    calls.session.mockResolvedValue(null);
    expect((await selectConnectedWorkspace(form, headers())).status).toBe("error");
    expect(calls.database).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation to remove the cross-account access grant", async () => {
    expect((await disconnectAccountConnection(new FormData(), headers())).status).toBe("error");
    expect(calls.session).not.toHaveBeenCalled(); expect(calls.database).not.toHaveBeenCalled();
  });
});

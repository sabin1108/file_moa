import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const guard = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn());

vi.mock("../../../src/server/auth/session-guards", () => ({ requireWorkspace: guard }));
vi.mock(
  "../../../src/server/auth/auth-rate-limit",
  () => ({ createAuthRateLimiter: () => ({ consumeAll: reserve }) })
);
vi.mock("../../../src/server/database/client", () => ({ getDatabase: vi.fn() }));

import { organizeLive } from "../../../src/server/organization/live-organization";

const fetchMock = vi.fn();
const owner = { userId: "fixture-user", workspaceId: "fixture-workspace" };
const excerpt = "성능 테스트 LCP 2.8초 실측 결과입니다.";
const input = () => ({
  requestId: `${Date.now()}:${crypto.randomUUID()}`,
  owner,
  consent: true,
  request: "성능 자료를 정리해줘",
  basis: "",
  scope: { kind: "all" },
  reference: null,
  destination: null,
  documents: [{
    id: "document-1",
    name: "memo.md",
    path: ["memo.md"],
    excerpt,
    size: 100,
    lastModified: 42,
    sha256: "a".repeat(64),
    excerptHash: createHash("sha256").update(excerpt).digest("hex")
  }],
});

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "fixture-private-key");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-secret-at-least-thirty-two-characters");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
  vi.stubGlobal("fetch", fetchMock);
  guard.mockReset().mockImplementation(async () => ({
    ...owner,
    sessionUserId: owner.userId,
    sessionExpiresAt: new Date(Date.now() + 60000).toISOString()
  }));
  reserve.mockReset().mockResolvedValue({ allowed: true });
  fetchMock.mockReset().mockResolvedValueOnce(Response.json({ input_tokens: 1200 })).mockResolvedValueOnce(Response.json({
    status: "completed",
    model: "gpt-6-luna-fixture-version",
    output: [{
      type: "message",
      status: "completed",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          summary: "검토할 제안입니다.",
          matches: [{ documentId: "document-1", destination: ["성능 자료"], evidence: excerpt, date: null }],
          held: [],
          questions: []
        })
      }]
    }],
    usage: { input_tokens: 1200, output_tokens: 100, total_tokens: 1300 },
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenAI organization composition with synthetic transport, identity and quota", () => {
  it("runs the actual policy, adapter and grounded review with one reserved request", async () => {
    const result = await organizeLive(input(), "http://127.0.0.1:3034", "openai");

    expect(result).toMatchObject({
      ok: true,
      model: "gpt-6-luna-fixture-version",
      organization: { matches: [{ documentId: "document-1", destination: ["성능 자료"] }] },
      usage: { totalTokens: 1300 }
    });
    expect(guard).toHaveBeenCalledTimes(3);
    expect(reserve).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(body.instructions).toContain("untrusted data");
    expect(body.text.format.schema.required).toContain("questions");
    expect(JSON.stringify(body)).not.toContain(owner.userId);
    expect(JSON.stringify(body)).not.toContain("fixture-private-key");
  });

  it("does not count or generate after stale provider confirmation", async () => {
    expect(await organizeLive(input(), "http://127.0.0.1:3034", "gemini")).toEqual({ ok: false, code: "unavailable" });
    expect(reserve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discards completed provider output after session revocation", async () => {
    guard.mockImplementationOnce(async () => ({
      ...owner,
      sessionUserId: owner.userId,
      sessionExpiresAt: new Date(Date.now() + 60000).toISOString()
    }))
      .mockImplementationOnce(async () => ({
        ...owner,
        sessionUserId: owner.userId,
        sessionExpiresAt: new Date(Date.now() + 60000).toISOString()
      }))
      .mockRejectedValueOnce(new Error("revoked-before-publish"));
    expect(await organizeLive(input(), "http://127.0.0.1:3034", "openai")).toEqual({ ok: false, code: "session" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

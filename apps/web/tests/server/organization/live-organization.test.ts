import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const guard = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());
const finish = vi.hoisted(() => vi.fn());

vi.mock("../../../src/server/ai/ai-usage", () => ({ startUsage: async () => { }, finishUsage: finish }));
vi.mock("../../../src/server/auth/session-guards", () => ({ requireWorkspace: guard }));
vi.mock("../../../src/server/auth/auth-rate-limit", () => ({
  createAuthRateLimiter: () => ({ consumeAll: reserve })
}));
vi.mock("../../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
vi.mock("../../../src/server/ai/ai-generation", async original => ({
  ...(await original<typeof import("../../../src/server/ai/ai-generation")>()),
  generateAiJson: generate
}));

import { organizeLive } from "../../../src/server/organization/live-organization";

const owner = { userId: "A", workspaceId: "workspace-A" };
const session = () => ({
  ...owner,
  sessionUserId: "A",
  sessionExpiresAt: new Date(Date.now() + 60000).toISOString()
});
const excerpt = "성능 테스트 LCP 2.8초 실측 결과입니다.";
const input = () => ({
  requestId: `${Date.now()}:${crypto.randomUUID()}`,
  owner,
  request: "성능 자료 정리",
  basis: "",
  scope: { kind: "all" },
  reference: null,
  destination: null,
  consent: true,
  documents: [
    {
      id: "document-1",
      name: "memo.md",
      path: ["회사", "memo.md"],
      excerpt,
      excerptHash: createHash("sha256").update(excerpt).digest("hex"),
      sha256: "a".repeat(64),
      size: 80,
      lastModified: 42
    }
  ]
});

beforeEach(() => {
  finish.mockReset();
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "fixture-key");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-live-secret-at-least-32-characters");
  vi.stubEnv("GEMINI_API_KEY", "fixture-key");
  guard.mockReset().mockImplementation(async () => session());
  reserve.mockReset().mockResolvedValue({ allowed: true });
  generate.mockReset().mockResolvedValue({
    value: {
      summary: "검토 제안입니다",
      matches: [{ documentId: "document-1", destination: ["성능"], evidence: excerpt, date: null }],
      held: []
    },
    model: "fixture",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
  });
});

describe("authenticated local excerpt boundary", () => {
  it("rejects a changed provider before reserving or sending personal excerpts", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
    expect(await organizeLive(input(), "http://127.0.0.1:3034", "gemini")).toEqual({ ok: false, code: "unavailable" });
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("reuses the authenticated boundary and prompt for the selected OpenAI provider", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
    expect(await organizeLive(input(), "http://127.0.0.1:3034", "openai")).toMatchObject({ ok: true });
    expect(generate.mock.calls[0][3]).toBe("openai");
    expect(guard).toHaveBeenCalledTimes(3);
    expect(reserve).toHaveBeenCalledOnce();
  });

  it("rejects forged date answers and reference paths before reserving or calling a provider", async () => {
    for (const extra of [
      { answers: [{ documentId: "document-1", date: "2026-01-01" }] },
      { answers: [{ documentId: "outside", exclude: true }] },
      { reference: ["보고서"], referenceTree: { root: ["보고서"], directories: [["outside"]], complete: true } }
    ]) {
      expect(await organizeLive({ ...input(), ...extra }, "http://127.0.0.1:3034")).toEqual({ ok: false, code: "input" });
    }

    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects aggregate excerpts and oversized metadata before reserving usage", async () => {
    const value = input();

    value.documents = Array.from({ length: 7 }, (_, index) => {
      const excerpt = "가".repeat(1000);
      const name = `memo-${index}.md`;

      return {
        ...value.documents[0],
        id: `document-${index + 1}`,
        name,
        path: [name],
        excerpt,
        excerptHash: createHash("sha256").update(excerpt).digest("hex"),
        size: 3000
      };
    });
    expect(await organizeLive(value, "http://127.0.0.1:3034")).toEqual({
      ok: false,
      code: "input"
    });
    value.documents = value.documents
      .slice(0, 5)
      .map(document => ({
        ...document,
        path: [...Array.from({ length: 64 }, () => "a".repeat(255)), document.name]
      }));
    expect(await organizeLive(value, "http://127.0.0.1:3034")).toEqual({
      ok: false,
      code: "input"
    });
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps the user's reference folder independent from the instruction and destination", async () => {
    const value = { ...input(), reference: ["보고서"], destination: ["검토"] };

    await organizeLive(value, "http://127.0.0.1:3034");

    const generation = generate.mock.calls[0][0];
    const body = JSON.parse(generation.input);

    expect(body.instruction).toBe(value.request);
    expect(body.context).toMatchObject({ reference: ["보고서"], destination: ["검토"], liveReview: true });
    expect(generation.instructions).not.toContain("The user asked for REPORTS");
    expect(generation.instructions).toContain(
      "its contents/structure have NOT been read"
    );
  });

  it("uses real workspace identity, bounded shared budgets, and revalidates the session before publish", async () => {
    expect(await organizeLive(input(), "http://127.0.0.1:3034")).toMatchObject({ ok: true });
    expect(guard).toHaveBeenCalledTimes(3);
    expect(reserve).toHaveBeenCalledOnce();
    expect(reserve.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "live-ai-v1:workspace:workspace-A", max: 10, window: 3600 }),
        expect.objectContaining({ key: "live-ai-v1:user:A", max: 10, window: 3600 }),
        expect.objectContaining({ key: "sample-ai-v1:global-minute", max: 1 }),
        expect.objectContaining({ key: "sample-ai-v1:global-hour", max: 12 })
      ])
    );
    expect(generate).toHaveBeenCalledOnce();

    const payload = generate.mock.calls[0][0];

    expect(JSON.stringify(payload)).toContain(excerpt);
    expect(JSON.stringify(payload)).not.toContain("workspace-A");
    expect(JSON.stringify(payload)).not.toContain("excerptHash");
  });

  it.each(["auth", "origin", "owner", "expiry"])(
    "rejects %s before quota or model access",
    async kind => {
      const value = input();

      if (kind === "auth") guard.mockRejectedValueOnce(Error("not authenticated"));

      if (kind === "owner") value.owner = { userId: "B", workspaceId: "workspace-B" };

      if (kind === "expiry")
        guard.mockResolvedValueOnce({ ...session(), sessionExpiresAt: new Date(0).toISOString() });

      expect(
        await organizeLive(
          value,
          kind === "origin" ? "https://evil.invalid" : "http://127.0.0.1:3034"
        )
      ).toMatchObject({ ok: false });
      expect(reserve).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    }
  );

  it.each([
    "hash",
    "path",
    "scope",
    "duplicate",
    "consent",
    "extra",
    "expired-id",
    "length",
    "bytes"
  ])("rejects invalid %s", async kind => {
    const value = input();

    if (kind === "hash") value.documents[0].excerptHash = "f".repeat(64);

    if (kind === "path") value.documents[0].path = ["..", "memo.md"];

    if (kind === "scope") Object.assign(value, { scope: { kind: "folder", path: ["outside"] } });

    if (kind === "duplicate") value.documents.push(value.documents[0]);

    if (kind === "consent") Object.assign(value, { consent: false });

    if (kind === "extra") Object.assign(value, { workspaceId: "forged" });

    if (kind === "expired-id") value.requestId = `${Date.now() - 3600000}:${crypto.randomUUID()}`;

    if (kind === "length") value.documents[0].excerpt = "x".repeat(1201);

    if (kind === "bytes") value.documents[0].size = 2 * 1024 * 1024 + 1;

    expect(await organizeLive(value, "http://127.0.0.1:3034")).toEqual({
      ok: false,
      code: "input"
    });
    expect(generate).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("denies duplicates even if payload changed and never silently retries", async () => {
    const value = input();

    await organizeLive(value, "http://127.0.0.1:3034");

    const rules = reserve.mock.calls[0][0];

    reserve.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect(await organizeLive({ ...value, request: "다른 요청" }, "http://127.0.0.1:3034")).toEqual(
      { ok: false, code: "limit", retryAfter: 60 }
    );
    expect(reserve.mock.calls[1][0]).toEqual(rules);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("does not send when identity changes while reserving and drops identity changes during generation", async () => {
    guard
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce({ ...session(), sessionUserId: "B" });
    expect(await organizeLive(input(), "http://127.0.0.1:3034")).toMatchObject({
      ok: false,
      code: "session"
    });
    expect(generate).not.toHaveBeenCalled();
    expect(finish).toHaveBeenLastCalledWith(
      expect.objectContaining(owner),
      expect.any(String),
      null,
      null
    );
    guard
      .mockReset()
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce({ ...session(), workspaceId: "B" });
    expect(await organizeLive(input(), "http://127.0.0.1:3034")).toMatchObject({
      ok: false,
      code: "session"
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(finish).toHaveBeenLastCalledWith(
      expect.objectContaining(owner),
      expect.any(String),
      "fixture",
      { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    );
  });

  it("rejects fabricated evidence and maps a provider timeout without leaking a body", async () => {
    generate.mockResolvedValueOnce({
      value: {
        summary: "제안",
        matches: [
          {
            documentId: "document-1",
            destination: ["성능"],
            evidence: "본문에 없는 근거를 날조했습니다",
            date: null
          }
        ],
        held: []
      }
    });
    expect(await organizeLive(input(), "http://127.0.0.1:3034")).toEqual({
      ok: false,
      code: "unavailable"
    });
    generate.mockRejectedValueOnce(new DOMException("sensitive body", "TimeoutError"));
    expect(await organizeLive(input(), "http://127.0.0.1:3034")).toEqual({
      ok: false,
      code: "timeout"
    });
  });
});

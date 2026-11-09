import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ session: vi.fn(), check: vi.fn(), quota: vi.fn(), start: vi.fn(), finish: vi.fn(), generate: vi.fn() }));
vi.mock("../../src/server/chat-session", () => ({ readChatSession: calls.session, revalidateChatStream: calls.check }));
vi.mock("../../src/server/auth-rate-limit", () => ({ createAuthRateLimiter: () => ({ consumeAll: calls.quota }) }));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
vi.mock("../../src/server/ai-usage", () => ({ startUsage: calls.start, finishUsage: calls.finish }));
vi.mock("../../src/server/chat-generation", () => ({ generateChat: calls.generate }));
import { handleChat } from "../../src/server/chat";
import { answerGrounded } from "../../src/server/grounded-chat";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const owner = { userId: "owner", workspaceId: "workspace", sessionUserId: "caller", sessionId: "session", sessionToken: "fixture-token", expiresAt: Date.now() + 60000 };
function request() {
  return new Request("http://127.0.0.1:3034/api/chat", { method: "POST", headers: { origin: "http://127.0.0.1:3034", "content-type": "application/json" }, body: JSON.stringify({ owner: { userId: owner.userId, workspaceId: owner.workspaceId }, requestId: `${Date.now()}:${crypto.randomUUID()}`, provider: "openai", messages: [{ role: "user", content: "합성 질문" }] }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "fixture-only");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-secret-at-least-32-characters");
  calls.session.mockResolvedValue({ ...owner, expiresAt: Date.now() + 60000 });
  calls.check.mockResolvedValue(true);
  calls.quota.mockResolvedValue({ allowed: true });
  calls.start.mockResolvedValue(undefined);
  calls.finish.mockResolvedValue(undefined);
  calls.generate.mockImplementation(async function* () {
    yield { type: "text", text: "합성 답변" };
    yield { type: "completed", model: "fixture", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } };
  });
});
afterEach(() => vi.unstubAllEnvs());

it("checks fresh authorization while the ledger reservation is still pending and gates generation on both", async () => {
  const gate = deferred();
  calls.start.mockReturnValue(gate.promise);
  const response = handleChat(request());
  try {
    await vi.waitFor(() => expect(calls.start).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(calls.check).toHaveBeenCalledOnce(), { timeout: 100 });
    expect(calls.generate).not.toHaveBeenCalled();
  } finally { gate.resolve(); await (await response).text(); }
});

it("registers the complete stream and settlement lifetime before the response can finish", async () => {
  const finish = deferred();
  calls.finish.mockReturnValue(finish.promise);
  const tasks: Promise<void>[] = [];
  const response = await handleChat(request(), task => { tasks.push(task); });
  try {
    await response.text();
    expect(tasks).toHaveLength(1);
    let completed = false;
    void tasks[0].then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
  } finally { finish.resolve(); await Promise.all(tasks); }
});

it("keeps cancellation settlement registered until it finishes and aborts generation", async () => {
  const finish = deferred();
  calls.finish.mockReturnValue(finish.promise);
  let providerSignal: AbortSignal | undefined;
  calls.generate.mockImplementation(async function* (_messages, _provider, signal: AbortSignal) {
    providerSignal = signal;
    await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    signal.throwIfAborted();
    yield { type: "text", text: "unreachable" };
  });
  const tasks: Promise<void>[] = [];
  const response = await handleChat(request(), task => { tasks.push(task); });
  try {
    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    await response.body!.cancel();
    expect(providerSignal!.aborted).toBe(true);
    await vi.waitFor(() => expect(calls.finish).toHaveBeenCalledOnce());
    expect(calls.finish).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: owner.workspaceId }), expect.any(String), null, null);
    let completed = false;
    void tasks[0].then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
  } finally { finish.resolve(); await Promise.all(tasks); }
});

it("does not call the provider when reservation fails", async () => {
  calls.start.mockRejectedValue(new Error("fixture reservation failure"));
  const tasks: Promise<void>[] = [];
  const response = await handleChat(request(), task => { tasks.push(task); });
  expect(await response.text()).toContain('"type":"error"');
  await Promise.all(tasks);
  expect(calls.generate).not.toHaveBeenCalled();
  expect(calls.finish).not.toHaveBeenCalled();
});

it("settles a pending reservation without starting generation when the reader cancels early", async () => {
  const reservation = deferred();
  calls.start.mockReturnValue(reservation.promise);
  const tasks: Promise<void>[] = [];
  const response = await handleChat(request(), task => { tasks.push(task); });
  await response.body!.cancel();
  reservation.resolve();
  await Promise.all(tasks);
  expect(calls.generate).not.toHaveBeenCalled();
  expect(calls.finish).toHaveBeenCalledOnce();
  expect(calls.finish).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: owner.workspaceId }), expect.any(String), null, null);
});

it("settles an authorized reservation as unknown when grounded authorization is revoked before generation", async () => {
  const { createHash } = await import("node:crypto");
  const excerpt = "합성 자료의 확인 가능한 본문입니다.";
  calls.check.mockResolvedValue(false);
  const result = await answerGrounded({ owner: { userId: owner.userId, workspaceId: owner.workspaceId }, requestId: `${Date.now()}:${crypto.randomUUID()}`, consent: true, question: "요약해 주세요", documents: [{ id: "document-1", name: "notes.md", path: ["notes.md"], excerpt, excerptHash: createHash("sha256").update(excerpt).digest("hex"), sha256: "a".repeat(64), size: 200, lastModified: 0 }] }, new Headers({ origin: "http://127.0.0.1:3034" }), "openai");
  expect(result).toEqual({ ok: false, code: "session" });
  expect(calls.finish).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: owner.workspaceId }), expect.any(String), null, null);
});

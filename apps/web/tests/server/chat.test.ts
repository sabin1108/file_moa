import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => vi.fn());
const revalidate = vi.hoisted(() => vi.fn());
const reserve = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/chat-session", () => ({ readChatSession: session, revalidateChatStream: revalidate }));
vi.mock("../../src/server/auth-rate-limit", () => ({ createAuthRateLimiter: () => ({ consumeAll: reserve }) }));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
vi.mock("../../src/server/chat-generation", () => ({ generateChat: generate }));
import { handleChat } from "../../src/server/chat";

const owner = { userId: "A", workspaceId: "workspace-A" };
const current = () => ({ ...owner, sessionUserId: "A", sessionId: "session-A", sessionToken: "fixture-token", expiresAt: Date.now() + 60_000 });
const input = () => ({ requestId: `${Date.now()}:${crypto.randomUUID()}`, owner, provider: "openai", messages: [{ role: "user", content: "안녕하세요" }] });
const usage = { inputTokens: 10, outputTokens: 3, totalTokens: 13 };
function request(body: unknown = input(), origin = "http://127.0.0.1:3034", signal?: AbortSignal) {
  return new Request("http://127.0.0.1:3034/api/chat", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body), signal });
}
async function events(response: Response) {
  return (await response.text()).split("\n\n").filter(Boolean).map(frame => JSON.parse(frame.slice(6)));
}

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "fixture-only");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-secret-at-least-32-characters");
  session.mockReset().mockImplementation(async () => current());
  revalidate.mockReset().mockResolvedValue(true);
  reserve.mockReset().mockResolvedValue({ allowed: true });
  generate.mockReset().mockImplementation(async function* () {
    yield { type: "text", text: "안녕" };
    yield { type: "text", text: "하세요" };
    yield { type: "completed", model: "fixture-model", usage };
  });
});
afterEach(() => vi.useRealTimers());

describe("GC-002/003 authenticated chat boundary", () => {
  it("starts the first batch timer with actual text and drains text received during a check without waiting for another provider event", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    let authorize!: (allowed: boolean) => void;
    revalidate.mockResolvedValueOnce(true).mockImplementationOnce(() => new Promise<boolean>(resolve => { authorize = resolve; }));
    let finishSource!: () => void;
    const sourceGate = new Promise<void>(resolve => { finishSource = resolve; });
    generate.mockImplementation(async function* () {
      yield { type: "text", text: "첫 묶음" };
      await new Promise(resolve => setTimeout(resolve, 150));
      yield { type: "text", text: "두 번째 묶음" };
      await sourceGate;
      yield { type: "completed", model: "fixture", usage };
    });
    const response = await handleChat(request());
    const reader = response.body!.getReader();
    await reader.read();
    await vi.advanceTimersByTimeAsync(99);
    expect(revalidate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(101);
    expect(revalidate).toHaveBeenCalledTimes(2);
    authorize(true);
    await vi.advanceTimersByTimeAsync(110);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("첫 묶음");
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("두 번째 묶음");
    expect(revalidate).toHaveBeenCalledTimes(3);
    finishSource();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("completed");
    await reader.cancel();
  });

  it("keeps reading provider text while a publication authorization is pending", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    let finishAuthorization!: (allowed: boolean) => void;
    const waitingAuthorization = new Promise<boolean>(resolve => { finishAuthorization = resolve; });
    revalidate.mockResolvedValueOnce(true).mockImplementationOnce(() => waitingAuthorization);
    let sourceFinished = false;
    generate.mockImplementation(async function* () {
      await new Promise(resolve => setTimeout(resolve, 110));
      yield { type: "text", text: "제가" };
      await new Promise(resolve => setTimeout(resolve, 200));
      yield { type: "text", text: " 이어서 받은 본문" };
      sourceFinished = true;
      yield { type: "completed", model: "fixture", usage };
    });
    const response = await handleChat(request());
    const reader = response.body!.getReader();
    await reader.read();
    await vi.advanceTimersByTimeAsync(400);
    expect(sourceFinished).toBe(true);
    finishAuthorization(true);
    const received = new Response(new ReadableStream({ async start(controller) {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; controller.enqueue(chunk.value); }
      controller.close();
    } }));
    const result = await events(received);
    expect(result.map(event => event.type)).toEqual(["text_delta", "text_delta", "completed"]);
    expect(result.filter(event => event.type === "text_delta").map(event => event.text).join("")).toBe("제가 이어서 받은 본문");
    expect(revalidate).toHaveBeenCalledTimes(3);
  });

  it("aborts the provider and drops buffered text when an in-flight publication is denied", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    let deny!: (allowed: boolean) => void;
    revalidate.mockResolvedValueOnce(true).mockImplementationOnce(() => new Promise<boolean>(resolve => { deny = resolve; }));
    let providerSignal: AbortSignal | undefined;
    generate.mockImplementation(async function* (_messages, _provider, signal: AbortSignal) {
      providerSignal = signal;
      await new Promise(resolve => setTimeout(resolve, 110));
      yield { type: "text", text: "hidden-private-text" };
      await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
      signal.throwIfAborted();
    });
    const response = await handleChat(request());
    const result = events(response);
    await vi.advanceTimersByTimeAsync(250);
    deny(false);
    const received = await result;
    expect(providerSignal?.aborted).toBe(true);
    expect(received.map(event => event.type)).toEqual(["accepted", "error"]);
    expect(received.at(-1).code).toBe("session");
  });

  it.each(["origin", "owner", "session", "provider", "expired", "system", "extra", "oversize", "stale"])("rejects %s before reservations or provider calls", async kind => {
    const value = input();
    let origin = "http://127.0.0.1:3034";
    if (kind === "origin") origin = "https://outside.invalid";
    if (kind === "owner") value.owner = { ...owner, workspaceId: "B" };
    if (kind === "session") session.mockResolvedValue(null);
    if (kind === "provider") value.provider = "gemini";
    if (kind === "expired") session.mockResolvedValue({ ...current(), expiresAt: Date.now() - 1 });
    if (kind === "system") value.messages[0].role = "system";
    if (kind === "oversize") value.messages[0].content = "a".repeat(32_769);
    if (kind === "stale") value.requestId = `${Date.now() - 360_000}:${crypto.randomUUID()}`;
    const response = await handleChat(request(kind === "extra" ? { ...value, documents: [] } : value, origin));
    expect(response.status).not.toBe(200);
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("fixture-only");
  });

  it("reserves shared request/workspace/user/global budgets atomically before a sanitized stream", async () => {
    const value = input();
    const response = await handleChat(request(value));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const result = await events(response);
    expect(result.map(event => event.type)).toEqual(["accepted", "text_delta", "completed"]);
    expect(result[1].text).toBe("안녕하세요");
    expect(result[2]).toMatchObject({ model: "fixture-model", usage });
    expect(result.every((event, index) => event.generationId === value.requestId && event.sequence === index)).toBe(true);
    expect(reserve).toHaveBeenCalledOnce();
    expect(reserve.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: `live-ai-v1:request:workspace-A:${value.requestId}`, max: 1 }),
      expect.objectContaining({ key: "live-ai-v1:workspace:workspace-A", max: 10, window: 3600 }),
      expect.objectContaining({ key: "live-ai-v1:user:A", max: 10, window: 3600 }),
      expect.objectContaining({ key: "sample-ai-v1:global-minute", max: 1 }),
      expect.objectContaining({ key: "sample-ai-v1:global-hour", max: 12 }),
    ]));
    expect(generate.mock.calls[0][0]).toEqual(value.messages);
    expect(session).toHaveBeenCalledOnce();
    expect(revalidate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("workspace-A");
  });

  it("does not call the provider after denied or failed reservations", async () => {
    reserve.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect((await handleChat(request())).status).toBe(429);
    reserve.mockRejectedValueOnce(new Error("private-db-detail"));
    const failed = await handleChat(request());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private-db-detail");
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses the remaining whole-request budget after a slow reservation", async () => {
    const started = Date.now();
    reserve.mockImplementation(async () => {
      vi.setSystemTime(started + 46_000);
      return { allowed: true };
    });
    const response = await handleChat(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "timeout" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects changed sessions after reservation without starting the model", async () => {
    revalidate.mockResolvedValue(false);
    const result = await events(await handleChat(request()));
    expect(result.at(-1)).toMatchObject({ type: "error", code: "session" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("drops text if ownership changed before publishing it", async () => {
    generate.mockImplementation(async function* () {
      revalidate.mockResolvedValue(false);
      yield { type: "text", text: "private-old-answer" };
      yield { type: "completed", model: "fixture", usage };
    });
    const result = await events(await handleChat(request()));
    expect(result.at(-1)).toMatchObject({ type: "error", code: "session" });
    expect(JSON.stringify(result)).not.toContain("private-old-answer");
  });

  it("keeps an upstream failure or missing completion incomplete and never retries", async () => {
    generate.mockImplementation(async function* () {
      yield { type: "text", text: "부분 답변" };
      throw new Error("private-provider-detail");
    });
    const result = await events(await handleChat(request()));
    expect(result.at(-1)).toMatchObject({ type: "error", code: "unavailable" });
    expect(result.find(event => event.type === "text_delta")?.text).toBe("부분 답변");
    expect(result.some(event => event.type === "completed")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-provider-detail");
    expect(generate).toHaveBeenCalledOnce();
  });

  it.each(["abort", "cancel"])("propagates client %s to the provider", async action => {
    let providerSignal: AbortSignal | undefined;
    generate.mockImplementation(async function* (_messages, _provider, signal: AbortSignal) {
      providerSignal = signal;
      yield { type: "text", text: "부분" };
      await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
      signal.throwIfAborted();
    });
    const abort = new AbortController();
    const response = await handleChat(request(input(), undefined, abort.signal));
    const reader = response.body!.getReader();
    await reader.read();
    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    if (action === "abort") abort.abort();
    await reader.cancel();
    expect(providerSignal?.aborted).toBe(true);
    expect(generate).toHaveBeenCalledOnce();
  });
});

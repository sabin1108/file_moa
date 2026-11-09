import { afterEach, describe, expect, it, vi } from "vitest";
import { readChatStream } from "../../src/features/conversation-workspace/services/chat-stream";
import type { ChatRequest } from "../../src/shared/general-chat";

const input: ChatRequest = { requestId: "fixture-generation", owner: { userId: "A", workspaceId: "A" }, provider: "openai", messages: [{ role: "user", content: "합성 질문" }] };
function response(events: unknown[]) {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}
const accepted = { type: "accepted", generationId: input.requestId, sequence: 0 };
const delta = { type: "text_delta", generationId: input.requestId, sequence: 1, text: "답변" };
const completed = { type: "completed", generationId: input.requestId, sequence: 2, model: "fixture", usage: null };
afterEach(() => vi.unstubAllGlobals());

describe("GC-004/005 browser transport contract", () => {
  it("posts to the fixed endpoint once and forwards validated events in order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([accepted, delta, completed]));
    vi.stubGlobal("fetch", fetchMock);
    const onEvent = vi.fn();
    await readChatStream(input, new AbortController().signal, onEvent);
    expect(onEvent.mock.calls.map(call => call[0])).toEqual([accepted, delta, completed]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]).toMatchObject(["/api/chat", { method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store" }]);
  });

  it.each(["generation", "sequence", "type", "EOF", "empty-completion"])("rejects %s and never retries", async kind => {
    const corrupted = kind === "generation" ? { ...delta, generationId: "old" } : kind === "sequence" ? { ...delta, sequence: 8 } : kind === "type" ? { ...delta, type: "tool" } : delta;
    const events = kind === "EOF" ? [accepted, delta] : kind === "empty-completion" ? [accepted, { ...completed, sequence: 1 }] : [accepted, corrupted, completed];
    const fetchMock = vi.fn().mockResolvedValue(response(events));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readChatStream(input, new AbortController().signal, vi.fn())).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not expose an HTTP error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-server-detail", { status: 429 })));
    await expect(readChatStream(input, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: "limit", message: "limit" });
  });
});

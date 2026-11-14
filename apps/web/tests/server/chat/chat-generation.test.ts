import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateChat } from "../../../src/server/chat/chat-generation";

const fetchMock = vi.fn();
const messages = [{ role: "user" as const, content: "합성 질문" }];
const usage = { input_tokens: 10, output_tokens: 3, total_tokens: 13 };
const completed = () => ({
  type: "response.completed",
  response: {
    status: "completed",
    model: "fixture-model",
    usage,
    output: [{ type: "message", status: "completed", content: [{ type: "output_text", text: "안녕하세요" }] }],
  }
});

function sse(events: unknown[]) {
  return new Response(
    events.map(value => `data: ${JSON.stringify(value)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } }
  );
}

async function collect(provider: "openai" | "gemini" = "openai", signal = AbortSignal.timeout(1000)) {
  const result = [];

  for await (const event of generateChat(messages, provider, signal)) result.push(event);

  return result;
}

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "fixture-openai-secret");
  vi.stubEnv("GEMINI_API_KEY", "fixture-gemini-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValueOnce(Response.json({ input_tokens: 10 })).mockResolvedValueOnce(sse([
    { type: "response.output_text.delta", delta: "안녕" },
    { type: "response.output_text.delta", delta: "하세요" },
    { type: "response.output_text.done", text: "안녕하세요" }, completed(),
  ]));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GC-004/006 provider stream normalization", () => {
  it("counts input, streams without duplicate done text, and validates final usage", async () => {
    expect(await collect()).toEqual([
      { type: "text", text: "안녕" }, { type: "text", text: "하세요" },
      {
        type: "completed",
        model: "fixture-model",
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 }
      },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);

    expect(body).toMatchObject({
      stream: true,
      store: false,
      max_output_tokens: 1600,
      reasoning: { effort: "none" },
      input: messages
    });
    expect(body.tools).toBeUndefined();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ cache: "no-store", redirect: "error" });
  });

  it.each(["response.incomplete", "response.failed", "response.refusal.delta", "error"])("does not complete %s", async type => {
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ input_tokens: 10 })).mockResolvedValueOnce(sse([{ type, message: "private-error", delta: "private-refusal" }]));
    await expect(collect()).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["missing-completed", "mismatched-text", "wrong-usage", "wrong-mime", "too-large"])("rejects %s", async kind => {
    const end = completed();

    if (kind === "mismatched-text") end.response.output[0].content[0].text = "different";

    if (kind === "wrong-usage") end.response.usage.input_tokens = -1;

    const response = kind === "wrong-mime"
      ? Response.json({})
      : kind === "too-large"
        ? new Response("x".repeat(1_048_577), { headers: { "content-type": "text/event-stream" } })
        : sse([
          { type: "response.output_text.delta", delta: "안녕하세요" }, ...(kind === "missing-completed" ? [] : [end]),
        ]);

    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ input_tokens: 10 })).mockResolvedValueOnce(response);
    await expect(collect()).rejects.toBeDefined();
  });

  it("does not generate over-budget input or retry HTTP failures", async () => {
    fetchMock.mockReset().mockResolvedValue(Response.json({ input_tokens: 4097 }));
    await expect(collect()).rejects.toMatchObject({ code: "input" });
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockReset().mockResolvedValue(new Response("private", { status: 429 }));
    await expect(collect()).rejects.toMatchObject({ code: "limit" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not start generation if authorization changed during token counting", async () => {
    const authorize = vi.fn().mockRejectedValue(new Error("session-changed"));

    await expect((async () => {
      for await (const event of generateChat(messages, "openai", new AbortController().signal, authorize)) void event;
    })()).rejects.toThrow("session-changed");
    expect(authorize).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("supports Gemini text chunks, excludes thoughts and does not invent unavailable usage", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ totalTokens: 10 })).mockResolvedValueOnce(sse([
      {
        candidates: [{ content: { parts: [{ text: "internal", thought: true }, { text: "안녕" }] } }],
        usageMetadata: { promptTokenCount: 10 }
      },
      { candidates: [{ content: { parts: [{ text: "하세요" }] }, finishReason: "STOP" }] },
    ]));

    const result = await collect("gemini");

    expect(result).toEqual([{ type: "text", text: "안녕" }, { type: "text", text: "하세요" }, { type: "completed", model: "gemini-3.5-flash-lite", usage: null }]);
    expect(fetchMock.mock.calls[1][0]).toContain(":streamGenerateContent?alt=sse");
  });

  it.each(["MAX_TOKENS", "SAFETY", "RECITATION"])("keeps Gemini %s incomplete", async finishReason => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ totalTokens: 10 })).mockResolvedValueOnce(sse([{ candidates: [{ finishReason }] }]));
    await expect(collect("gemini")).rejects.toBeDefined();
  });

  it("honors abort before fetch and between counting and generation", async () => {
    const abort = new AbortController();

    abort.abort();
    await expect(collect("openai", abort.signal)).rejects.toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();

    const during = new AbortController();

    fetchMock.mockReset().mockImplementation(async () => {
      during.abort();

      return Response.json({ input_tokens: 10 });
    });
    await expect(collect("openai", during.signal)).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

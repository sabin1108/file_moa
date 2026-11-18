import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readJsonGenerationStream } from "../../../src/server/ai/json-generation-stream";

function stream(events: unknown[]) {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
  return new Response(new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } });
}
it("forwards only real output, validates canonical completion and rejects interrupted streams", async () => {
  const onText = vi.fn();
  const json = '{"answer":"응답"}';
  const deltas = [{ type: "response.reasoning_summary_text.delta", delta: "private" }, { type: "response.output_text.delta", delta: json.slice(0, 9) }, { type: "response.output_text.delta", delta: json.slice(9) }];
  const response = { output: [{ type: "message", content: [{ type: "output_text", text: json }] }] };
  expect(await readJsonGenerationStream(stream([...deltas, { type: "response.completed", response }]), new AbortController().signal, "openai", onText)).toEqual(response);
  expect(onText.mock.calls.map(call => call[0])).toEqual([json.slice(0, 9), json]);
  await expect(readJsonGenerationStream(stream(deltas), new AbortController().signal, "openai", () => {})).rejects.toThrow();
  await expect(readJsonGenerationStream(stream([...deltas, { type: "response.completed", response: { output: [] } }]), new AbortController().signal, "openai", () => {})).rejects.toThrow();
});
it("collects Gemini output without thought and requires STOP", async () => {
  const onText = vi.fn();
  const raw = await readJsonGenerationStream(stream([
    { candidates: [{ content: { parts: [{ text: "private", thought: true }, { text: '{"answer":' }] } }] },
    { candidates: [{ content: { parts: [{ text: '"답"}' }] }, finishReason: "STOP" }] },
    { usageMetadata: { totalTokenCount: 3 } },
  ]), new AbortController().signal, "gemini", onText);
  expect(onText.mock.calls.at(-1)?.[0]).toBe('{"answer":"답"}');
  expect(raw).toMatchObject({ usageMetadata: { totalTokenCount: 3 } });
  await expect(readJsonGenerationStream(stream([{ candidates: [{ finishReason: "MAX_TOKENS" }] }]), new AbortController().signal, "gemini", onText)).rejects.toThrow();
});

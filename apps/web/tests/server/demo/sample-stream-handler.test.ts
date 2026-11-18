import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "fixture" }) }) }));
const mocks = vi.hoisted(() => ({ context: vi.fn(), answer: vi.fn(), organize: vi.fn() }));
vi.mock("../../../src/server/demo/sample-ai", () => ({ requireSampleContext: mocks.context, sampleAiFailure: () => ({ ok: false, code: "unavailable" }) }));
vi.mock("../../../src/server/demo/sample-answer", () => ({ answerSample: mocks.answer }));
vi.mock("../../../src/server/demo/sample-organization", () => ({ organizeSample: mocks.organize }));
import { handleSampleStream } from "../../../src/server/demo/sample-stream-handler";
const input = { requestId: "d986bf5f-e730-447d-a3c0-d48cf4a91483" };
const request = (body: unknown) => new Request("https://fixture.invalid/demo/stream", { method: "POST", headers: { origin: "https://fixture.invalid" }, body: JSON.stringify(body) });
beforeEach(() => { mocks.context.mockReset(); mocks.answer.mockReset(); mocks.organize.mockReset(); });
it("streams accepted and readable deltas before completion, excluding raw plans and reasoning", async () => {
  let done!: () => void;
  mocks.answer.mockImplementation(async (_input, _context, _provider, preview: (text: string) => void) => {
    preview('{"answer":"첫'); preview('{"answer":"첫 답변","citations":[]}');
    await new Promise<void>(resolve => { done = resolve; });
    return { ok: false, code: "timeout" };
  });
  const response = await handleSampleStream(request({ kind: "answer", provider: "openai", input }));
  const reader = response.body!.getReader();
  const frames: string[] = [];
  for (let index = 0; index < 3; index++) frames.push(new TextDecoder().decode((await reader.read()).value));
  expect(frames.map(frame => JSON.parse(frame.slice(6)).type)).toEqual(["accepted", "text", "text"]);
  expect(frames.map(frame => JSON.parse(frame.slice(6)).text).filter(Boolean)).toEqual(["첫", " 답변"]);
  done();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"code":"timeout"');
  expect((await reader.read()).done).toBe(true);
});
it("rejects missing authority, unknown options and oversized input before generation", async () => {
  mocks.context.mockImplementationOnce(() => { throw Error("session"); });
  expect((await handleSampleStream(request({ kind: "answer", provider: "openai", input }))).status).toBe(403);
  expect((await handleSampleStream(request({ kind: "answer", provider: "openai", input, model: "override" }))).status).toBe(400);
  expect((await handleSampleStream(request({ kind: "answer", provider: "openai", input: { ...input, data: "a".repeat(263001) } }))).status).toBe(400);
  expect(mocks.answer).not.toHaveBeenCalled();
});

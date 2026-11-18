import { afterEach, expect, it, vi } from "vitest";
import { requestSampleStream } from "../../src/features/sample-workspace/sample-stream";

afterEach(() => vi.unstubAllGlobals());
const requestId = "d986bf5f-e730-447d-a3c0-d48cf4a91483";
function response(events: object[]) {
  return new Response(events.map((event, sequence) => `data: ${JSON.stringify({ requestId, sequence, ...event })}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}
it("shows text before completion, without retrying a truncated or mismatched stream", async () => {
  const text = vi.fn();
  const fetcher = vi.fn().mockResolvedValue(response([{ type: "accepted" }, { type: "text", text: "생성된 일부" }, { type: "result", result: { ok: false, code: "timeout" } }]));
  vi.stubGlobal("fetch", fetcher);
  expect(await requestSampleStream("answer", "openai", { requestId }, text)).toEqual({ ok: false, code: "timeout" });
  expect(text).toHaveBeenCalledWith("생성된 일부");
  fetcher.mockResolvedValue(response([{ type: "accepted" }, { type: "text", text: "일부" }]));
  await expect(requestSampleStream("answer", "openai", { requestId }, text)).rejects.toThrow("incomplete");
  fetcher.mockResolvedValue(response([{ type: "accepted" }, { type: "text", text: "잘못된 요청", requestId: crypto.randomUUID() }]));
  await expect(requestSampleStream("answer", "openai", { requestId }, text)).rejects.toThrow("sequence");
  expect(fetcher).toHaveBeenCalledTimes(3);
});

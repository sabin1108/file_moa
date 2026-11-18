import type { AiProvider } from "../../shared/ai-provider";
import type { SampleAnswerAction } from "../../shared/sample-answer";
import type { SampleOrganizationAction } from "../../shared/sample-organization";
import { readSseData } from "../../shared/sse";
import { sampleStreamEventSchema } from "../../shared/sample-stream";

export async function requestSampleStream(kind: "answer" | "organization", provider: AiProvider | null, input: { requestId: string }, onText?: (text: string) => void, signal = new AbortController().signal) {
  const response = await fetch("/demo/stream", { method: "POST", credentials: "same-origin", redirect: "error", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, provider, input }), signal, cache: "no-store" });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("sample-stream-unavailable");
  }
  let sequence = 0;
  let result;
  let accepted = false;
  let text = "";
  for await (const data of readSseData(response.body, signal, 2_097_152)) {
    const event = sampleStreamEventSchema.parse(JSON.parse(data));
    if (event.requestId !== input.requestId || event.sequence !== sequence++ || result) throw new Error("sample-stream-sequence");
    if (event.type === "accepted") {
      if (accepted || event.sequence !== 0) throw new Error("sample-stream-accepted");
      accepted = true;
    } else {
      if (!accepted) throw new Error("sample-stream-accepted");
      if (event.type === "text") {
        text += event.text;
        if (text.length > 8000) throw new Error("sample-stream-size");
        onText?.(text);
      }
      else result = event.result;
    }
  }
  if (!result || (result.ok && (kind === "answer" ? !("answer" in result) : !("organization" in result)))) throw new Error("sample-stream-incomplete");
  return result;
}

export const streamingSampleAnswer = (provider: AiProvider | null): SampleAnswerAction => async (input, onText, signal) => {
  const result = await requestSampleStream("answer", provider, input, onText, signal);
  if (result.ok && !("answer" in result)) throw new Error("sample-stream-result");
  return result;
};
export const streamingSampleOrganization = (provider: AiProvider | null): SampleOrganizationAction => async (input, onText, signal) => {
  const result = await requestSampleStream("organization", provider, input, onText, signal);
  if (result.ok && !("organization" in result)) throw new Error("sample-stream-result");
  return result;
};

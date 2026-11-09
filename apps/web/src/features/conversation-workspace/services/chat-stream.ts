import { chatEventSchema, ChatError, CHAT_LIMITS, type ChatEvent, type ChatRequest } from "../../../shared/general-chat";
import { readSseData } from "../../../shared/sse";

/** The only browser transport exception: same-origin, fixed chat endpoint, no retry or provider access. */
export async function readChatStream(input: ChatRequest, signal: AbortSignal, onEvent: (event: ChatEvent) => void) {
  const response = await fetch("/api/chat", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    credentials: "same-origin", cache: "no-store", redirect: "error", signal,
  });
  if (!response.ok || !response.body || response.headers.get("content-type")?.split(";")[0].trim() !== "text/event-stream") {
    await response.body?.cancel().catch(() => undefined);
    throw new ChatError(response.status === 429 ? "limit" : response.status === 401 ? "session" : response.status === 403 ? "origin" : response.status === 400 ? "input" : "unavailable");
  }
  let sequence = -1;
  let length = 0;
  for await (const data of readSseData(response.body, signal, CHAT_LIMITS.streamBytes)) {
    signal.throwIfAborted();
    const event = chatEventSchema.parse(JSON.parse(data) as unknown);
    if (event.generationId !== input.requestId || event.sequence !== sequence + 1 || (sequence === -1) !== (event.type === "accepted")) throw new ChatError("interrupted");
    sequence = event.sequence;
    if (event.type === "text_delta") length += event.text.length;
    if (length > CHAT_LIMITS.answerCharacters || (event.type === "completed" && !length)) throw new ChatError("interrupted");
    onEvent(event);
    if (event.type === "completed" || event.type === "error") return;
  }
  throw new ChatError("interrupted");
}

import "server-only";
import { z } from "zod";
import { readSseData } from "../../shared/sse";
import { SampleAiError } from "./ai-provider";

const geminiChunkSchema = z.object({
  candidates: z.array(z.object({
    index: z.literal(0).optional(),
    finishReason: z.string().optional(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional(),
  })).max(1).optional(),
  usageMetadata: z.unknown().optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

/** Only output text is forwarded; reasoning and provider metadata stay on the server. */
export async function readJsonGenerationStream(response: Response, signal: AbortSignal, provider: "openai" | "gemini", onText: (text: string) => void) {
  if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    await response.body?.cancel().catch(() => undefined);
    throw new SampleAiError(response.status === 429 ? "limit" : "unavailable", "upstream");
  }
  let text = "";
  let completed: unknown;
  let gemini: { candidates?: unknown; usageMetadata?: unknown } | undefined;
  for await (const data of readSseData(response.body, signal, 2_097_152)) {
    if (data === "[DONE]") continue;
    const value: unknown = JSON.parse(data);
    if (provider === "openai") {
      const event = z.object({ type: z.string() }).parse(value);
      if (event.type === "response.output_text.delta") {
        if (completed) throw new SampleAiError("unavailable", "invalid-response");
        text += z.object({ delta: z.string() }).parse(value).delta;
        onText(text);
      } else if (event.type === "response.completed") {
        if (completed) throw new SampleAiError("unavailable", "invalid-response");
        completed = z.object({ response: z.unknown() }).parse(value).response;
      } else if (["error", "response.failed", "response.incomplete", "response.refusal.delta"].includes(event.type)) {
        throw new SampleAiError("unavailable", "invalid-response");
      }
    } else {
      const chunk = geminiChunkSchema.parse(value);
      if (chunk.promptFeedback?.blockReason) throw new SampleAiError("unavailable", "invalid-response");
      const candidate = chunk.candidates?.[0];
      const delta = candidate?.content?.parts.filter(part => !part.thought).map(part => part.text ?? "").join("") ?? "";
      if (completed) {
        if (delta || candidate?.finishReason) throw new SampleAiError("unavailable", "invalid-response");
        if (chunk.usageMetadata && gemini) gemini.usageMetadata = chunk.usageMetadata;
        continue;
      }
      text += delta;
      if (text) onText(text);
      gemini = { candidates: [{ finishReason: candidate?.finishReason, content: { parts: [{ text }] } }], usageMetadata: chunk.usageMetadata ?? gemini?.usageMetadata };
      if (candidate?.finishReason) {
        if (candidate.finishReason !== "STOP") throw new SampleAiError("unavailable", "output-limit");
        completed = gemini;
      }
    }
    if (text.length > 262_144) throw new SampleAiError("unavailable", "output-limit");
  }
  if (!completed) throw new SampleAiError("unavailable", "network");
  if (provider === "openai") {
    const final = z.object({ output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) }).parse(completed);
    const canonical = final.output.filter(item => item.type === "message").flatMap(item => item.content ?? []).filter(part => part.type === "output_text").map(part => part.text ?? "").join("");
    if (canonical !== text) throw new SampleAiError("unavailable", "invalid-response");
  }
  return completed;
}

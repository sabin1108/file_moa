import "server-only";
import { z } from "zod";
import type { AiJsonRequest } from "../../shared/ai-provider";
import { AI_LIMITS, readProviderJson, SampleAiError } from "./ai-provider";
import { parseAiJson } from "./parse-ai-json";

export const SAMPLE_GEMINI_MODEL = "gemini-3.5-flash-lite";
const envelope = z.object({
  candidates: z.array(z.object({
    finishReason: z.literal("STOP"),
    content: z.object({ parts: z.array(z.object({ text: z.string(), thought: z.boolean().optional() })).min(1) }),
  })).length(1),
  usageMetadata: z.object({
    promptTokenCount: z.number().int().nonnegative(),
    candidatesTokenCount: z.number().int().nonnegative(),
    totalTokenCount: z.number().int().nonnegative(),
  }),
});

export async function generateGeminiJson(request: AiJsonRequest, signal: AbortSignal,
  limits: { inputTokens: number } = AI_LIMITS) {
  signal.throwIfAborted();

  const key = process.env.GEMINI_API_KEY?.trim();

  if (!key) throw new SampleAiError("unavailable");

  const generation = {
    systemInstruction: { parts: [{ text: request.instructions }] },
    contents: [{ role: "user", parts: [{ text: request.input }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: request.outputTokens,
      thinkingConfig: { thinkingLevel: "minimal" },
      responseJsonSchema: request.schema,
    },
  };
  const call = async (method: "countTokens" | "generateContent", body: unknown) => {
    signal.throwIfAborted();

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SAMPLE_GEMINI_MODEL}:${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
      redirect: "error",
    }).catch(() => {
      if (signal.aborted) throw signal.reason;
      throw new SampleAiError("unavailable", "network");
    });

    return readProviderJson(response, method === "generateContent" ? Math.max(65_536, Math.min(262_144, request.outputTokens * 32)) : 65_536);
  };
  const count = z.object({ totalTokens: z.number().int().positive() }).parse(await call("countTokens", {
    generateContentRequest: { model: `models/${SAMPLE_GEMINI_MODEL}`, ...generation },
  }));

  if (count.totalTokens > limits.inputTokens) throw new SampleAiError("input", "capacity");

  const raw = await call("generateContent", generation);
  const status = z.object({ candidates: z.array(z.object({ finishReason: z.string().optional() })) }).safeParse(raw);
  if (status.success && status.data.candidates.some(candidate => candidate.finishReason === "MAX_TOKENS")) throw new SampleAiError("unavailable", "output-limit");
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) throw new SampleAiError("unavailable", "invalid-response");
  const response = parsed.data;
  const text = response.candidates[0].content.parts.filter(part => !part.thought).map(part => part.text).join("");

  const value = parseAiJson(text);
  return {
    value,
    model: SAMPLE_GEMINI_MODEL,
    usage: {
      inputTokens: response.usageMetadata.promptTokenCount,
      outputTokens: response.usageMetadata.candidatesTokenCount,
      totalTokens: response.usageMetadata.totalTokenCount
    },
  };
}

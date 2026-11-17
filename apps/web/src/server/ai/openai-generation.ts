import "server-only";
import { z } from "zod";
import type { AiJsonRequest } from "../../shared/ai-provider";
import { AI_LIMITS, readProviderJson, SampleAiError } from "./ai-provider";
import { parseAiJson } from "./parse-ai-json";

export const OPENAI_MODEL = "gpt-6-luna";

const outputMessage = z.object({
  type: z.literal("message"),
  status: z.literal("completed"),
  content: z.array(z.object({ type: z.literal("output_text"), text: z.string() })).min(1),
});
const envelope = z.object({
  status: z.literal("completed"),
  model: z.string().min(1).max(200),
  output: z.array(z.discriminatedUnion("type", [
    outputMessage,
    z.object({ type: z.literal("reasoning") }),
  ])).min(1),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
});

export async function generateOpenAiJson(
  request: AiJsonRequest,
  signal: AbortSignal,
  limits: { inputTokens: number } = AI_LIMITS,
) {
  signal.throwIfAborted();

  const key = process.env.OPENAI_API_KEY?.trim();

  if (!key) throw new SampleAiError("unavailable");

  const input = {
    model: OPENAI_MODEL,
    instructions: request.instructions,
    input: request.input,
    text: { format: { type: "json_schema", name: "file_proposal", strict: true, schema: request.schema } },
  };
  const call = async (path: "responses/input_tokens" | "responses", body: unknown) => {
    signal.throwIfAborted();

    const response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
      redirect: "error",
    }).catch(() => {
      if (signal.aborted) throw signal.reason;
      throw new SampleAiError("unavailable", "network");
    });

    return readProviderJson(response, path === "responses" ? Math.max(65_536, Math.min(262_144, request.outputTokens * 32)) : 65_536);
  };
  const count = z.object({ input_tokens: z.number().int().nonnegative() }).parse(
    await call("responses/input_tokens", input),
  );

  if (count.input_tokens > limits.inputTokens) throw new SampleAiError("input", "capacity");

  const raw = await call("responses", {
    ...input,
    store: false,
    reasoning: { effort: "none" },
    max_output_tokens: request.outputTokens,
  });
  const status = z.object({ status: z.string(), incomplete_details: z.object({ reason: z.string() }).nullable().optional() }).safeParse(raw);
  if (status.success && status.data.status === "incomplete") throw new SampleAiError("unavailable", status.data.incomplete_details?.reason === "max_output_tokens" ? "output-limit" : "invalid-response");
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) throw new SampleAiError("unavailable", "invalid-response");
  const response = parsed.data;
  const texts = response.output.flatMap(item => item.type === "message" ? item.content.map(part => part.text) : []);

  if (!texts.length) throw new SampleAiError("unavailable");

  const value = parseAiJson(texts.join(""));
  return {
    value,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.total_tokens
    },
  };
}

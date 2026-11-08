import "server-only";
import type { AiProvider } from "../shared/ai-provider";
import type { SampleAiErrorCode } from "../shared/sample-ai";

export const AI_LIMITS = { inputTokens: 4096, outputTokens: 1600, timeoutMs: 25_000 } as const;

export class SampleAiError extends Error {
  constructor(readonly code: SampleAiErrorCode) { super(code); }
}

export function getAiProvider(): AiProvider | null {
  const configured = process.env.AI_PROVIDER?.trim();
  const provider = configured || (process.env.OPENAI_API_KEY?.trim() ? "openai" : "gemini");
  if (provider === "openai" && process.env.OPENAI_API_KEY?.trim()) return "openai";
  if (provider === "gemini" && process.env.GEMINI_API_KEY?.trim()) return "gemini";
  return null;
}

export function getSampleAiProvider(): AiProvider | null {
  const enabled = process.env.ENABLE_PUBLIC_SAMPLE_AI?.trim();
  if (enabled === "true") return getAiProvider();
  if (enabled || process.env.VERCEL === "1" || process.env.VERCEL_ENV) return null;
  try {
    const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
    if (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)) return getAiProvider();
  } catch { /* Missing configuration leaves sample generation disabled. */ }
  return null;
}

export function requireSampleAiProvider(expected: unknown = getSampleAiProvider()): AiProvider {
  const provider = getSampleAiProvider();
  if (!provider || provider !== expected) throw new SampleAiError("unavailable");
  return provider;
}

export function requireAiProvider(expected: unknown = getAiProvider()): AiProvider {
  const configured = getAiProvider();
  if (!configured || expected !== configured) throw new SampleAiError("unavailable");
  return configured;
}

export async function readProviderJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SampleAiError(response.status === 429 ? "limit" : "unavailable");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SampleAiError("unavailable");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 65_536) throw new SampleAiError("unavailable");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

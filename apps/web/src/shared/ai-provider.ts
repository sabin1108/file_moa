export type AiProvider = "openai" | "gemini";
export type AiFailureReason = "configuration" | "authorization" | "capacity" | "output-limit" | "invalid-response" | "upstream" | "network";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
};

export type AiJsonRequest = Readonly<{
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  outputTokens: number;
}>;

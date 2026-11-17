export type AiProvider = "openai" | "gemini";
export type AiFailureReason = "configuration" | "authorization" | "capacity" | "output-limit" | "invalid-response" | "invalid-json" | "invalid-evidence" | "invalid-date" | "invalid-plan" | "invalid-review" | "upstream" | "network";

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

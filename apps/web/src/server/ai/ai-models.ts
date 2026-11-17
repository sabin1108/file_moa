import "server-only";

export const OPENAI_MODELS = {
  default: { model: "gpt-6-luna", reasoning: "none" },
  demo: { model: "gpt-6-astra", reasoning: "medium" },
} as const;

export type AiGenerationProfile = keyof typeof OPENAI_MODELS;

import { z } from "zod";
import type { SampleAiUsage } from "./sample-ai";
import { personalContextSchema } from "./personal-context";

export const CHAT_LIMITS = {
  requestBytes: 32_768,
  inputCharacters: 12_000,
  answerCharacters: 8_000,
  streamBytes: 1_048_576,
} as const;

export const chatErrorCodes = ["session", "origin", "input", "limit", "timeout", "unavailable", "interrupted", "refused"] as const;
export type ChatErrorCode = typeof chatErrorCodes[number];

export class ChatError extends Error {
  constructor(readonly code: ChatErrorCode) { super(code); }
}

const messageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(CHAT_LIMITS.answerCharacters),
});

export const chatRequestSchema = z.strictObject({
  requestId: z.string().regex(/^\d{13}:[a-f0-9-]{36}$/u).refine(value => {
    const [time, id] = value.split(":");
    return z.uuid().safeParse(id).success && Number(time) >= Date.now() - 300_000 && Number(time) <= Date.now() + 30_000;
  }),
  owner: z.strictObject({ userId: z.string().min(1).max(128), workspaceId: z.string().min(1).max(128) }),
  provider: z.enum(["openai", "gemini"]),
  personalContext: personalContextSchema.optional(),
  messages: z.array(messageSchema).min(1).max(7).refine(messages =>
    messages.length % 2 === 1 &&
    messages.every((message, index) => message.role === (index % 2 ? "assistant" : "user") && (message.role !== "user" || message.content.length <= 800)) &&
    messages.reduce((length, message) => length + message.content.length, 0) <= CHAT_LIMITS.inputCharacters,
  ),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatMessageInput = ChatRequest["messages"][number];

const usageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
const eventBase = {
  generationId: z.string().min(1).max(80),
  sequence: z.number().int().nonnegative(),
};
export const chatEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...eventBase, type: z.literal("accepted") }),
  z.strictObject({ ...eventBase, type: z.literal("text_delta"), text: z.string().min(1).max(CHAT_LIMITS.answerCharacters) }),
  z.strictObject({ ...eventBase, type: z.literal("completed"), model: z.string().min(1).max(200), usage: usageSchema.nullable() }),
  z.strictObject({ ...eventBase, type: z.literal("error"), code: z.enum(chatErrorCodes), retryAfter: z.number().int().positive().optional() }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
export type ChatGenerationEvent =
  | { type: "text"; text: string }
  | { type: "completed"; model: string; usage: SampleAiUsage | null };

export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  session: "로그인 상태가 바뀌었어요. 새로고침한 뒤 다시 확인해 주세요.",
  origin: "요청한 화면을 확인하지 못했어요. 새로고침해 주세요.",
  input: "질문이나 앞선 대화가 한도를 넘었거나 처리할 수 없는 형식이에요. 내용을 줄여 다시 보내 주세요.",
  limit: "AI 요청 한도에 도달했어요. 잠시 후 직접 다시 보내 주세요.",
  timeout: "응답 시간이 지났어요. 여기까지 받은 답변은 미완료이며 자동으로 다시 보내지 않습니다.",
  unavailable: "지금 답변을 받지 못했어요. 자동으로 다시 보내지 않습니다.",
  interrupted: "응답 연결이 끊겼어요. 여기까지 받은 답변은 미완료이며 자동으로 다시 보내지 않습니다.",
  refused: "AI가 이 요청에 답변하지 않았어요. 질문을 바꿔 직접 다시 보내 주세요.",
};

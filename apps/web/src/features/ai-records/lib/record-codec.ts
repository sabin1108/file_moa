import { aiRecordPayloadSchema, type AiRecordPayload } from "../../../shared/ai-records";
import type { LocalRecord } from "@personal-ai/domain";

const marker = "\n<!-- moa-record-state-v1\n";

export function recordMarkdown(payload: AiRecordPayload): string {
  if (payload.type === "conversation") {
    return `# ${payload.title}\n\n` + payload.turns.map(turn =>
      `## 질문${turn.kind && turn.kind !== "chat" ? ` · ${{ find: "자료 찾기", organize: "자료 정리", grounded: "선택 자료 질문" }[turn.kind]}` : ""}\n\n${turn.question}\n\n## 답변${turn.status === "completed" ? "" : " · 미완료"}\n\n${turn.answer.slice(0, turn.visibleLength)}\n`,
    ).join("\n");
  }
  if (payload.type === "artifact") return payload.markdown;
  if (payload.type === "memory") return `# ${payload.title}\n\n${payload.content}\n`;
  return `# ${payload.displayName || payload.title}\n\n${payload.description}\n\n${payload.preferences}\n`;
}

export function encodeRecord(input: AiRecordPayload): string {
  const payload = aiRecordPayloadSchema.parse(input);
  const state = JSON.stringify(payload).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
  return recordMarkdown(payload) + marker + state + "\n-->\n";
}

export function decodeRecord(body: string, metadata: LocalRecord): AiRecordPayload {
  const position = body.lastIndexOf(marker);
  if (position < 0 || !body.endsWith("\n-->\n")) throw new Error("invalid-record-payload");
  const payload = aiRecordPayloadSchema.parse(JSON.parse(body.slice(position + marker.length, -5)));
  const kind = payload.type === "profile" ? "memory" : payload.type;
  const state = payload.type === "conversation" ? "draft" : payload.type === "profile" ? "approved" : payload.status;
  if (metadata.recordId !== payload.id || metadata.kind !== kind || metadata.state !== state || metadata.createdAt !== payload.updatedAt) {
    throw new Error("record-payload-mismatch");
  }
  if (payload.type === "memory" && JSON.stringify(payload.scope) !== JSON.stringify(metadata.scope)) throw new Error("record-scope-mismatch");
  return payload;
}

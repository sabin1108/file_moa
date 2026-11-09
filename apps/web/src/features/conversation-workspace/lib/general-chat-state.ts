import type { ChatErrorCode, ChatEvent, ChatMessageInput } from "../../../shared/general-chat";
import type { SampleAiUsage } from "../../../shared/sample-ai";
import type { ConversationKind } from "../../../shared/ai-records";
import type { GroundedEvidence } from "../../../shared/grounded-evidence";

export type ChatTurn = Readonly<{
  kind?: ConversationKind;
  id: string;
  question: string;
  answer: string;
  visibleLength: number;
  status: "pending" | "completed" | "stopped" | "error";
  error?: ChatErrorCode;
  model?: string;
  usage?: SampleAiUsage | null;
  evidence?: GroundedEvidence;
}>;
export type ChatState = Readonly<{ draft: string; turns: readonly ChatTurn[]; active: string | null; sequence: number }>;
export const initialChatState: ChatState = { draft: "", turns: [], active: null, sequence: -1 };
export type ChatAction =
  | { type: "draft"; value: string }
  | { type: "start"; id: string; question: string }
  | { type: "event"; event: ChatEvent }
  | { type: "reveal"; id: string; characters: number }
  | { type: "fail"; id: string; code: ChatErrorCode }
  | { type: "stop"; id: string }
  | { type: "reset" };
export type RestorableChatAction = ChatAction | { type: "restore"; state: ChatState }
  | { type: "local"; id: string; kind: Exclude<ConversationKind, "chat">; question: string; answer: string; status: ChatTurn["status"] }
  | { type: "local-update"; id: string; answer: string; status: ChatTurn["status"]; evidence?: GroundedEvidence };

export function chatReducer(state: ChatState, action: RestorableChatAction): ChatState {
  if (action.type === "restore") return action.state;
  if (action.type === "reset") return initialChatState;
  if (action.type === "local") {
    if (state.active || state.turns.some(turn => turn.id === action.id)) return state;
    const { id, kind, question, answer, status } = action;
    return { ...state, turns: [...state.turns, { id, kind, question, answer, status, visibleLength: answer.length }] };
  }
  if (action.type === "local-update") {
    return { ...state, turns: state.turns.map(turn => turn.id === action.id && turn.kind && turn.kind !== "chat" ? { ...turn, answer: action.answer, visibleLength: action.answer.length, status: action.status, evidence: turn.kind === "grounded" && action.status === "completed" ? action.evidence : undefined } : turn) };
  }
  if (action.type === "draft") return { ...state, draft: action.value };
  if (action.type === "start") {
    if (state.active) return state;
    return { ...state, draft: "", active: action.id, sequence: -1, turns: [...state.turns, { id: action.id, kind: "chat", question: action.question, answer: "", visibleLength: 0, status: "pending" }] };
  }
  const id = action.type === "event" ? action.event.generationId : action.id;
  if (id !== state.active) return state;
  const turn = state.turns.at(-1)!;
  if (action.type === "reveal") {
    let visibleLength = Math.max(turn.visibleLength, Math.min(action.characters, turn.answer.length));
    if (visibleLength < turn.answer.length && /[\uD800-\uDBFF]/u.test(turn.answer.charAt(visibleLength - 1))) visibleLength--;
    return { ...state, turns: [...state.turns.slice(0, -1), { ...turn, visibleLength }] };
  }
  let updated: ChatTurn;
  let sequence = state.sequence;
  if (action.type === "stop") updated = { ...turn, status: "stopped" };
  else if (action.type === "fail") updated = { ...turn, status: "error", error: action.code };
  else {
    const event = action.event;
    if (event.sequence !== state.sequence + 1 || (state.sequence === -1) !== (event.type === "accepted")) {
      updated = { ...turn, status: "error", error: "interrupted" };
    } else {
      sequence = event.sequence;
      if (event.type === "accepted") return { ...state, sequence };
      if (event.type === "text_delta") updated = { ...turn, answer: turn.answer + event.text };
      else if (event.type === "completed" && turn.answer) updated = { ...turn, status: "completed", model: event.model, usage: event.usage };
      else updated = { ...turn, status: "error", error: event.type === "error" ? event.code : "interrupted" };
    }
  }
  if (updated.status !== "pending") {
    const answer = updated.status === "stopped" || updated.error === "session"
      ? updated.answer.slice(0, updated.visibleLength)
      : updated.answer;
    updated = { ...updated, answer, visibleLength: answer.length };
  }
  return {
    ...state, sequence,
    active: updated.status === "pending" ? id : null,
    turns: [...state.turns.slice(0, -1), updated],
    draft: updated.status === "error" && !updated.answer ? turn.question : state.draft,
  };
}

/** The user chooses to send recent completed turns; partial answers are never implicit context. */
export function chatContext(state: ChatState, question: string): ChatMessageInput[] {
  const turns = state.turns.filter(turn => turn.status === "completed" && (!turn.kind || turn.kind === "chat")).slice(-3);
  while (turns.length && turns.reduce((sum, turn) => sum + turn.question.length + turn.answer.length, question.length) > 6000) turns.shift();
  return [...turns.flatMap(turn => [{ role: "user" as const, content: turn.question }, { role: "assistant" as const, content: turn.answer }]), { role: "user", content: question }];
}

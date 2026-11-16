import { SAMPLE_LIFETIME_MS, type SampleCatalog, type SampleSession } from "../../shared/sample-contract";
import {
  createSampleState,
  SAMPLE_STATE_CHARACTER_LIMIT,
  restoreSampleState,
  transitionSampleState,
  type SampleAction,
  type SampleState
} from "./sample-state";
import { SAMPLE_AI_MESSAGES, type SampleAiAction } from "../../shared/sample-ai";
import type { SampleOrganizationAction } from "../../shared/sample-organization";
import type { SampleAnswerAction } from "../../shared/sample-answer";
import type { ChatMessageInput } from "../../shared/general-chat";

type SampleStorage = Pick<Storage, "getItem" | "setItem">;

type Snapshot = Readonly<{
  state: SampleState;
  ready: boolean;
  expired: boolean;
  notice: string | null;
  aiPending: boolean
}>;

export class SampleWorkspaceStore {
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: Snapshot;
  private readonly initial: Snapshot;
  private loaded = false;
  private generation = 0;
  private readonly deadline: number;
  readonly storageKey: string;

  constructor(private catalog: SampleCatalog, session: SampleSession, private storage: () => SampleStorage = () => sessionStorage, remainingMs = SAMPLE_LIFETIME_MS) {
    this.initial = { state: createSampleState(catalog), ready: false, expired: false, notice: null, aiPending: false };
    this.snapshot = this.initial;
    this.storageKey = `moa.sample.v1.${session.id}`;
    this.deadline = performance.now() + Math.max(0, Math.min(remainingMs, SAMPLE_LIFETIME_MS));
  }

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => this.initial;

  private emit() {
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    if (!this.loaded) {
      this.loaded = true;

      let state = this.snapshot.state;
      let notice: string | null = null;

      try {
        const saved = this.storage().getItem(this.storageKey);

        if (saved) {
          state = restoreSampleState(this.catalog, saved);
          if (state.selected.length) notice = `이 탭에서 보관한 파일 선택 ${state.selected.length}개를 복원했어요. 파일 선택의 ‘전체 선택 해제’로 비울 수 있습니다.`;
        }
      } catch {
        notice = "보관된 샘플 상태를 읽지 못해 처음 상태로 열었습니다. 이 탭에서 계속 체험할 수 있어요.";
      }

      this.snapshot = { ...this.snapshot, state, ready: true, expired: performance.now() >= this.deadline, notice };
      this.emit();
    }

    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.generation++;
      this.snapshot = { ...this.snapshot, expired: true, aiPending: false };
      this.emit();
    }, Math.max(0, this.deadline - performance.now()));

    return () => {
      this.listeners.delete(listener);

      if (!this.listeners.size) {
        clearTimeout(this.timer);
        this.generation++;
        this.snapshot = { ...this.snapshot, aiPending: false };
      }
    };
  };

  dispatch = (action: SampleAction) => {
    if (!this.snapshot.ready) return false;

    this.generation++;

    if (performance.now() >= this.deadline) {
      this.snapshot = { ...this.snapshot, expired: true, aiPending: false };
      this.emit();

      return false;
    }

    try {
      const state = transitionSampleState(this.catalog, this.snapshot.state, action);
      const serialized = JSON.stringify(state);
      if (serialized.length > SAMPLE_STATE_CHARACTER_LIMIT) throw Error("sample-state-limit");
      let notice: string | null = null;

      try {
        this.storage().setItem(this.storageKey, serialized);
      } catch {
        notice = "샘플 변경은 이 탭에 적용했지만 임시 보관하지 못했습니다. 새로고침하면 변경이 사라질 수 있어요.";
      }

      this.snapshot = { state, ready: true, expired: false, notice, aiPending: false };
    } catch (error) {
      const period = error instanceof Error && ["unconfirmed-find-period", "unsupported-find-period"].includes(error.message);
      this.snapshot = { ...this.snapshot, aiPending: false, notice: period
        ? "검색 기간과 날짜 기준을 확인해 주세요. 예: ‘2026년 10월 작성일 기준 성능 찾아줘’. 기간을 넓히려면 날짜 표현을 지우고 다시 입력하세요."
        : "샘플 작업을 진행하지 못했습니다. 선택한 자료와 목적지 또는 임시 기록 한도를 확인해 주세요." };
      this.emit();
      return false;
    }

    this.emit();
    return true;
  };

  cancelAi = () => {
    this.generation++;
    this.snapshot = {
      ...this.snapshot,
      aiPending: false,
      notice: "응답 대기를 취소했어요. 이미 전송한 요청은 서버에서 끝날 수 있으며 요청 한도는 복원되지 않아요."
    };
    this.emit();
  };

  requestAnswer = async (request: SampleAnswerAction, mode: "chat" | "grounded") => {
    const state = this.snapshot.state;
    if (!this.snapshot.ready || this.snapshot.aiPending || performance.now() >= this.deadline || state.phase === "review" || !state.draft.trim()
      || (mode === "grounded" && !state.selected.length)) return;
    const history: ChatMessageInput[][] = [];
    for (let index = 0; index < state.messages.length - 1; index++) {
      const question = state.messages[index];
      const answer = state.messages[index + 1];
      if (question.author === "user" && question.id.startsWith("ai-question-") && answer.author === "assistant"
        && answer.id === `ai-answer-${question.id.slice("ai-question-".length)}`) {
        history.push([{ role: "user", content: question.text }, { role: "assistant", content: answer.text }]);
        index++;
      }
    }
    let messages: ChatMessageInput[] = [...history.slice(-3).flat(), { role: "user", content: state.draft }];
    while (messages.length > 1 && messages.reduce((sum, message) => sum + message.content.length, 0) > 12000) messages = messages.slice(2);
    const generation = ++this.generation;
    const requestId = crypto.randomUUID();
    this.snapshot = { ...this.snapshot, aiPending: true, notice: null };
    this.emit();
    try {
      const result = await request({ requestId, mode, messages, documentIds: mode === "grounded" ? [...state.selected] : [], consent: true });
      if (generation !== this.generation || performance.now() >= this.deadline) return;
      if (result.ok) { this.dispatch({ type: "ai-answer", requestId, mode, question: state.draft, result }); return; }
      this.snapshot = { ...this.snapshot, aiPending: false, notice: SAMPLE_AI_MESSAGES[result.code] + (result.retryAfter ? ` 약 ${result.retryAfter}초 뒤 다시 시도할 수 있어요.` : "") };
    } catch {
      if (generation !== this.generation || performance.now() >= this.deadline) return;
      this.snapshot = { ...this.snapshot, aiPending: false, notice: SAMPLE_AI_MESSAGES.unavailable };
    }
    this.emit();
  };

  requestAi = async (request: SampleAiAction) => {
    if (!this.snapshot.ready || this.snapshot.aiPending || performance.now() >= this.deadline
      || this.snapshot.state.phase !== "select"
      || !this.snapshot.state.selected.length) return;

    const generation = ++this.generation;

    this.snapshot = { ...this.snapshot, aiPending: true, notice: null };
    this.emit();

    try {
      const result = await request({ requestId: crypto.randomUUID(), documentIds: [...this.snapshot.state.selected], consent: true });

      if (generation !== this.generation || performance.now() >= this.deadline) return;

      if (result.ok) {
        this.dispatch({ type: "ai-propose", result });

        return;
      }

      this.snapshot = {
        ...this.snapshot,
        aiPending: false,
        notice: SAMPLE_AI_MESSAGES[result.code]
          + (result.retryAfter ? ` 약 ${result.retryAfter}초 뒤 다시 시도할 수 있어요.` : "")
      };
    } catch {
      if (generation !== this.generation || performance.now() >= this.deadline) return;

      this.snapshot = { ...this.snapshot, aiPending: false, notice: SAMPLE_AI_MESSAGES.unavailable };
    }

    this.emit();
  };

  requestOrganization = async (request: SampleOrganizationAction, instruction: string, documentIds: readonly string[]) => {
    if (!this.snapshot.ready || this.snapshot.aiPending || performance.now() >= this.deadline || !instruction.trim()
      || !documentIds.length) return;

    this.dispatch({ type: "intent", instruction });

    const generation = ++this.generation;

    this.snapshot = { ...this.snapshot, aiPending: true, notice: null };
    this.emit();

    try {
      const result = await request({ requestId: crypto.randomUUID(), documentIds: [...documentIds], instruction, consent: true });

      if (generation !== this.generation || performance.now() >= this.deadline) return;

      if (result.ok) {
        this.dispatch({ type: "organization-propose", instruction, candidateIds: documentIds, result });

        return;
      }

      this.snapshot = {
        ...this.snapshot,
        aiPending: false,
        notice: SAMPLE_AI_MESSAGES[result.code]
          + (result.retryAfter ? ` 약 ${result.retryAfter}초 뒤 다시 시도할 수 있어요.` : "")
      };
    } catch {
      if (generation !== this.generation || performance.now() >= this.deadline) return;

      this.snapshot = { ...this.snapshot, aiPending: false, notice: SAMPLE_AI_MESSAGES.unavailable };
    }

    this.emit();
  };
}

import { selectOrganizationCandidates } from "../../../shared/organization-candidates";
import { LIVE_ORGANIZATION_LIMITS, organizationSelectionIssue } from "../../../shared/live-organization-limits";
import { copyFolderPath } from "../folder-path";
import type {
  OrganizationScope,
  SourceSnapshot,
  ReferenceSnapshot,
} from "./source-snapshot-rules";
import {
  hasUnansweredReview,
  validateReviewAnswers,
  type ReviewAnswer,
  type ReviewQuestion,
} from "../../../shared/live-organization-review";
import type { FolderListing } from "../browsing/source-folder-listing";
import { DestinationPickerController } from "../destination-picker/destination-picker-controller";
import {
  LIVE_AI_MESSAGES,
  LIVE_AI_REASON_MESSAGES,
  ORGANIZATION_RECOVERY_MESSAGE,
  type LiveOrganizationAction,
  type LiveOrganizationResult,
} from "../../../shared/live-organization";
import type { ConnectionOwner } from "../types";
import type { SnapshotDocument } from "./source-snapshot-rules";
import { parseOrganizationReply } from "./organization-reply";
import type { OrganizationConditionStep, OrganizationReplyContext } from "./organization-conversation";

type Conditions = Readonly<{
  purpose: "organize" | "grounded";
  request: string;
  scope: OrganizationScope | null;
  basis: string;
  reference: readonly string[] | null;
  destination: readonly string[] | null;
  includeSubfolders: boolean | null;
}>;

type FolderChoice = "scope" | "reference" | "destination";

export type OrganizationPreparationState = Conditions &
  Readonly<{
    phase:
    | "draft"
    | "scope"
    | "reading"
    | "ready"
    | "checking"
    | "sending"
    | "review"
    | "error";
    submittedRequest: string;
    snapshot: SourceSnapshot | null;
    candidateIds: readonly string[];
    selectedIds: readonly string[];
    partialAccepted: boolean;
    consentKey: string | null;
    issue: string | null;
    picking: FolderChoice | "answer" | null;
    reviewConfirmed: boolean;
    conversationStep: OrganizationConditionStep | null;
    result: Extract<LiveOrganizationResult, { ok: true }> | null;
    answers: readonly ReviewAnswer[];
    questions: readonly ReviewQuestion[];
    replyDraft: string;
    submittedReply: string;
  }>;

const initial: OrganizationPreparationState = {
  purpose: "organize",
  request: "",
  scope: null,
  basis: "",
  reference: null,
  destination: null,
  includeSubfolders: null,
  phase: "draft",
  submittedRequest: "",
  snapshot: null,
  candidateIds: [],
  selectedIds: [],
  partialAccepted: false,
  consentKey: null,
  issue: null,
  picking: null,
  reviewConfirmed: false,
  conversationStep: null,
  result: null,
  answers: [],
  questions: [],
  replyDraft: "",
  submittedReply: "",
};

/** Provider-owned preparation and explicit transfer. No automatic requests or file writer. */

export class OrganizationPreparationController {
  private state = initial;
  private listeners = new Set<() => void>();
  private sequence = 0;
  private abort: AbortController | null = null;
  private explicitConditions = new Set<"scope" | "reference" | "destination">();
  private answerTargets: readonly string[] = [];
  private questionHistory: OrganizationConditionStep[] = [];
  readonly picker: DestinationPickerController;

  constructor(
    private readonly read: (
      scope: OrganizationScope,
      instruction: string,
      signal: AbortSignal,
      reference?: readonly string[],
    ) => Promise<SourceSnapshot>,
    private readonly readFolder: (
      path: readonly string[],
      signal: AbortSignal,
    ) => Promise<FolderListing>,
    private readonly permissionLost: () => void = () => { },
    private readonly recheck?: (
      documents: readonly SnapshotDocument[],
      instruction: string,
      signal: AbortSignal,
      reference?: ReferenceSnapshot,
    ) => Promise<ConnectionOwner>,
    private readonly infer?: (
      request: string,
      signal: AbortSignal,
    ) => Promise<Partial<Conditions>>,
  ) {
    this.picker = new DestinationPickerController(readFolder, permissionLost);
  }

  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: OrganizationPreparationState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private stop() {
    this.sequence++;
    this.abort?.abort();
    this.abort = null;
  }

  update = (change: Partial<Conditions>) => {
    this.stop();
    this.answerTargets = [];
    this.picker.close();

    const next = { ...this.state, ...change };
    if (Object.hasOwn(change, "scope") && !Object.hasOwn(change, "includeSubfolders")) {
      next.includeSubfolders = next.scope?.kind === "folder" ? null : next.scope?.kind === "all" ? true : false;
    }
    const conversational = this.state.conversationStep !== null && next.purpose === "organize";

    for (const key of ["scope", "reference", "destination"] as const)
      if (Object.hasOwn(change, key)) this.explicitConditions.add(key);

    if (change.request !== undefined && change.request !== this.state.request) {
      if (!this.explicitConditions.has("scope")) next.scope = null;

      if (!this.explicitConditions.has("reference")) next.reference = null;

      if (!this.explicitConditions.has("destination")) next.destination = null;
    }

    if (next.scope?.kind === "folder")
      next.scope = { kind: "folder", path: copyFolderPath(next.scope.path) };

    if (next.scope?.kind === "selected")
      next.scope = {
        kind: "selected",
        entries: next.scope.entries.map((entry) => ({
          ...entry,
          path: copyFolderPath(entry.path),
        })),
      };

    if (next.reference) next.reference = copyFolderPath(next.reference);

    if (next.destination) next.destination = copyFolderPath(next.destination);

    const nextStep = conversational ? this.nextConversationStep(next) : null;
    if (this.state.conversationStep && nextStep && this.state.conversationStep !== nextStep) this.questionHistory.push(this.state.conversationStep);
    this.publish({
      ...next,
      picking: null,
      reviewConfirmed: false,
      conversationStep: nextStep,
      phase: conversational ? "scope" : "draft",
      snapshot: null,
      selectedIds: [],
      candidateIds: [],
      consentKey: null,
      partialAccepted: false,
      result: null,
      answers: [],
      questions: [],
      replyDraft: "",
      submittedReply: "",
      issue: null,
    });
  };

  private nextConversationStep(state: Conditions = this.state): OrganizationConditionStep {
    if (!state.scope) return "scope";
    if (state.scope.kind === "folder" && state.includeSubfolders === null) return "coverage";
    if (!state.basis.trim()) return "basis";
    if (state.destination === null && !this.explicitConditions.has("destination")) return "destination";
    return "confirm";
  }
  beginConversation = async () => {
    const basis = this.state.basis || (/주제별|내용별|형식별|확장자별|날짜별|언어별|프로젝트별/u.test(this.state.request) ? this.state.request : "");
    this.publish({ ...this.state, basis, conversationStep: "scope" });
    await this.prepare();
  };
  private changeConversation(change: Partial<Conditions>) {
    this.update(change);
    this.publish({ ...this.state, phase: "scope", conversationStep: this.nextConversationStep() });
  }
  backConversation = () => {
    if (["reading", "checking", "sending"].includes(this.state.phase)) return;
    if (!this.state.conversationStep) {
      this.update({});
      this.publish({ ...this.state, conversationStep: "confirm" });
      return;
    }
    const previous = this.questionHistory.pop() ?? "scope";
    const scope = previous === "coverage" && this.state.scope?.kind === "selected"
      ? { kind: "folder" as const, path: this.state.scope.entries[0].path.slice(0, -1) }
      : this.state.scope;
    this.publish({ ...this.state, scope, conversationStep: previous, issue: null });
  };
  replyToConversation = async (text: string, context: OrganizationReplyContext = {}, action?: LiveOrganizationAction) => {
    if (["reading", "checking", "sending"].includes(this.state.phase)) return;
    const value = text.trim().replace(/[.!?]+$/u, "");
    const compact = value.replace(/\s+/gu, "");
    if (!value || value.length > 800) {
      this.publish({ ...this.state, issue: "답변은 800자 이내로 적어 주세요." });
      return;
    }
    if (/^(?:이전|뒤로|이전단계|이전질문)(?:으로|로)?$/u.test(compact)) {
      this.backConversation();
      return;
    }
    if (this.state.conversationStep === "coverage") {
      if (/^(?:하위(?:폴더)?(?:까지|도)?(?:포함해줘|포함|함께)?|모두포함|네)$/u.test(compact)) this.changeConversation({ includeSubfolders: true });
      else if (/^(?:이폴더파일만|현재폴더파일만|파일만|하위폴더제외|아니요)$/u.test(compact) && this.state.scope?.kind === "folder") {
        const path = this.state.scope.path;
        const sequence = this.sequence;
        const abort = new AbortController();
        this.abort = abort;
        this.publish({ ...this.state, phase: "reading", issue: null });
        try {
          const listing = await this.readFolder(path, abort.signal);
          if (sequence !== this.sequence || abort.signal.aborted) return;
          const entries = listing.entries.filter(entry => entry.kind === "file").map(entry => ({ path: [...path, entry.name], kind: "file" as const }));
          if (listing.truncated || !entries.length) this.publish({ ...this.state, phase: "scope", issue: listing.truncated ? "이 폴더의 파일을 모두 확인하지 못했어요. 더 작은 폴더를 선택해 주세요." : "이 폴더 바로 안에는 파일이 없어요. 하위 폴더를 포함하거나 다른 폴더를 선택해 주세요." });
          else this.changeConversation({ scope: { kind: "selected", entries }, includeSubfolders: false });
        } catch (error) {
          if (sequence === this.sequence && !abort.signal.aborted) {
            this.publish({ ...this.state, phase: "scope", issue: "폴더의 파일을 확인하지 못했어요. 폴더를 다시 선택해 주세요." });
            if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) this.permissionLost();
          }
        } finally { if (sequence === this.sequence) this.abort = null; }
      } else this.publish({ ...this.state, issue: "‘하위 폴더까지 포함해줘’ 또는 ‘이 폴더 파일만’으로 알려 주세요." });
      return;
    }
    const correction = value.match(/^(범위|정리 기준|기준|목적지|저장 위치|참고(?: 폴더)?)\s*(?:은|는|:)\s*(.+)$/u);
    let field: "scope" | "basis" | "destination" | "reference" | null = null;
    let answer = value;
    if (correction) {
      field = correction[1] === "범위" ? "scope" : /기준/u.test(correction[1]) ? "basis" : correction[1].startsWith("참고") ? "reference" : "destination";
      answer = correction[2].replace(/\s*바꿔\s*줘$/u, "").trim();
    } else if (this.state.conversationStep && this.state.conversationStep !== "confirm") field = this.state.conversationStep;
    else if (this.state.conversationStep === "confirm" && /^(?:이대로(?:자료)?확인해줘|자료확인(?:해줘|실행)?|준비해줘|다음|계속|이대로)$/u.test(compact)) {
      this.publish({ ...this.state, conversationStep: null, issue: null });
      await this.prepare();
      return;
    }
    if (field === "basis") {
      if (/^(?:다음|계속|네|아니|아니요|전송.*|.*(?:뭐야|어떤.*좋아|추천해줘|모르겠어))$/u.test(answer.replace(/\s/gu, ""))) {
        this.publish({ ...this.state, issue: "예를 들어 ‘주제별로’ 또는 ‘본문 언어별로’처럼 원하는 분류 기준을 알려 주세요." });
        return;
      }
      this.changeConversation({ basis: /^(?:기본|알아서|주제별로?)$/u.test(answer.replace(/\s/gu, "")) ? "본문 내용을 보고 주제별로 정리" : answer });
      return;
    }
    if (field === "scope" && /^(?:전체|전부|다|모두|연결한폴더전체)(?:로|에서|만)?$/u.test(answer.replace(/\s/gu, ""))) {
      this.changeConversation({ scope: { kind: "all" } });
      return;
    }
    if (field === "scope" && /^(?:현재|지금|이)폴더(?:(?:만|에서)|(?:를)?정리(?:하고싶어|해줘))?$|^여기(?:만)?$/u.test(answer.replace(/\s/gu, ""))) {
      if (context.currentPath) this.changeConversation({ scope: { kind: "folder", path: context.currentPath } });
      else this.publish({ ...this.state, issue: "현재 보고 있는 폴더를 확인할 수 없어요. 폴더 이름이나 ‘전체’를 알려 주세요." });
      return;
    }
    if (field === "destination" && /^(?:나중에(?:정할게|고를게)?|아직미정|미지정|계획에서(?:정할게|고를게))$/u.test(answer.replace(/\s/gu, ""))) {
      this.changeConversation({ destination: null });
      return;
    }
    if ((field === "destination" || field === "reference") && /^(?:현재|지금|이)폴더(?:로|를참고)?$/u.test(answer.replace(/\s/gu, ""))) {
      if (context.currentPath) this.changeConversation({ [field]: context.currentPath });
      else this.publish({ ...this.state, issue: "현재 폴더를 확인할 수 없어요. 정확한 경로나 폴더 선택으로 알려 주세요." });
      return;
    }
    if (field && this.infer) {
      const name = answer.replace(/^['"]|['"]$/gu, "").trim();
      if (!name || /["'“”「」『』]/u.test(name)) {
        this.publish({ ...this.state, issue: "폴더 하나의 이름이나 정확한 경로로 알려 주세요. 여러 조건은 나눠서 답할 수 있어요." });
        return;
      }
      const query = `"${name}"${field === "scope" ? "에서" : field === "reference" ? "를 참고" : "로"}`;
      const sequence = this.sequence;
      const abort = new AbortController();
      this.abort = abort;
      this.publish({ ...this.state, phase: "reading", issue: null });
      try {
        const inferred = await this.infer(query, abort.signal);
        if (sequence !== this.sequence || abort.signal.aborted) return;
        if (inferred[field] !== undefined) this.changeConversation({ [field]: inferred[field] });
        else this.publish({ ...this.state, phase: "scope", issue: "폴더를 하나로 정하지 못했어요. 연결 폴더 안의 정확한 경로를 알려 주거나 폴더 선택으로 확인해 주세요." });
      } catch (error) {
        if (sequence === this.sequence && !abort.signal.aborted) {
          this.publish({ ...this.state, phase: "scope", issue: "폴더를 확인하지 못했어요. 연결 상태와 이름을 확인해 주세요." });
          if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) this.permissionLost();
        }
      } finally { if (sequence === this.sequence) this.abort = null; }
      return;
    }
    if (!field && /^(?:확인한)?일부(?:자료)?만(?:사용할게|사용|사용해줘)$/u.test(compact) && this.state.snapshot && !this.state.snapshot.complete) {
      this.acceptPartial(true);
      return;
    }
    if (!field && /^(?:자료)?(?:전송에동의(?:해|해요|합니다)|외부AI전송에동의(?:해|해요|합니다))$/u.test(compact) && this.state.snapshot) {
      if (!action) this.publish({ ...this.state, issue: "현재 AI 전송을 사용할 수 없어요." });
      else { this.consent(true); await this.send(action); }
      return;
    }
    if (!field && this.state.snapshot && this.state.questions.length) {
      this.updateReply(value);
      this.submitReply();
      if (!this.state.issue && !hasUnansweredReview(this.state.questions, this.state.answers)) this.confirmReview();
      return;
    }
    this.publish({ ...this.state, issue: this.state.snapshot ? "바꿀 조건은 ‘범위는…’, ‘기준은…’, ‘목적지는…’으로 알려 주세요. AI 제안을 받으려면 ‘전송에 동의해’라고 답해 주세요." : "지금 묻는 범위·기준·목적지를 알려 주세요. ‘다음’으로 조건을 건너뛰지는 않아요." });
  };

  prepare = async () => {
    this.stop();

    const { request, basis } = this.state;
    let { scope } = this.state;

    if (!request.trim()) return;

    if (
      this.infer
      &&
      ((!scope && !this.explicitConditions.has("scope"))
        ||
        (this.state.reference === null &&
          !this.explicitConditions.has("reference"))
        ||
        (this.state.destination === null &&
          !this.explicitConditions.has("destination")))
    ) {
      const sequence = this.sequence;
      const abort = new AbortController();

      this.abort = abort;
      this.publish({
        ...this.state,
        phase: "reading",
        issue: null,
        result: null,
        consentKey: null,
      });

      try {
        const inferred = await this.infer(request, abort.signal);

        if (sequence !== this.sequence || abort.signal.aborted) return;

        if (!this.explicitConditions.has("scope"))
          scope ??= inferred.scope ?? null;

        this.publish({
          ...this.state,
          scope,
          reference: this.explicitConditions.has("reference")
            ? this.state.reference
            : (this.state.reference ?? inferred.reference ?? null),
          destination: this.explicitConditions.has("destination")
            ? this.state.destination
            : (this.state.destination ?? inferred.destination ?? null),
        });
      } catch (error) {
        if (sequence !== this.sequence || abort.signal.aborted) return;

        this.publish({
          ...this.state,
          phase: "error",
          issue: "폴더 조건을 확인하지 못했어요. 연결 권한을 확인해 주세요.",
        });

        if (
          error instanceof DOMException &&
          ["NotAllowedError", "SecurityError"].includes(error.name)
        )
          this.permissionLost();

        return;
      } finally {
        if (sequence === this.sequence) this.abort = null;
      }
    }

    if (!scope) {
      this.publish({
        ...this.state,
        phase: "scope",
        submittedRequest: request.trim(),
        consentKey: null,
      });

      return;
    }

    if (this.state.conversationStep !== null) {
      this.publish({ ...this.state, phase: "scope", scope, conversationStep: this.nextConversationStep(), issue: null });
      return;
    }

    const sequence = this.sequence;
    const abort = new AbortController();

    this.abort = abort;
    this.publish({
      ...this.state,
      phase: "reading",
      submittedRequest: request.trim(),
      snapshot: null,
      selectedIds: [],
      candidateIds: [],
      consentKey: null,
      partialAccepted: false,
      result: null,
      answers: [],
      questions: [],
      replyDraft: "",
      submittedReply: "",
      issue: null,
    });

    try {
      const snapshot =
        this.state.reference === null
          ? await this.read(scope, `${request}\n${basis}`, abort.signal)
          : await this.read(
            scope,
            `${request}\n${basis}`,
            abort.signal,
            this.state.reference,
          );

      if (sequence !== this.sequence || abort.signal.aborted) return;

      const candidateIds = selectOrganizationCandidates(
        snapshot.documents,
        `${request}\n${basis}`,
        this.state.purpose === "organize" ? LIVE_ORGANIZATION_LIMITS : undefined,
      ).map((document) => document.id);

      this.publish({
        ...this.state,
        phase: "ready",
        snapshot,
        candidateIds,
        selectedIds: candidateIds,
      });
    } catch (error) {
      if (sequence !== this.sequence || abort.signal.aborted) return;

      this.publish({
        ...this.state,
        phase: "error",
        issue:
          "자료를 읽지 못했어요. 연결 권한과 폴더 상태를 확인한 뒤 다시 준비해 주세요.",
      });

      if (
        error instanceof DOMException &&
        ["NotAllowedError", "SecurityError"].includes(error.name)
      )
        this.permissionLost();
    } finally {
      if (sequence === this.sequence) this.abort = null;
    }
  };

  toggleDocument = (id: string) => {
    if (!this.state.snapshot?.documents.some(document => document.id === id)) return;

    this.stop();

    const selectedIds = this.state.selectedIds.includes(id)
      ? this.state.selectedIds.filter((value) => value !== id)
      : [...this.state.selectedIds, id];

    this.publish({
      ...this.state,
      phase: "ready",
      selectedIds,
      issue: organizationSelectionIssue(this.state.snapshot.documents.filter(document => selectedIds.includes(document.id))),
      consentKey: null,
      result: null,
      answers: [],
      questions: [],
      replyDraft: "",
      submittedReply: "",
    });
  };
  acceptPartial = (accepted: boolean) => {
    this.stop();
    this.publish({
      ...this.state,
      phase: this.state.snapshot ? "ready" : this.state.phase,
      partialAccepted: accepted,
      consentKey: null,
      result: null,
    });
  };
  private confirmationKey(state: OrganizationPreparationState) {
    const documents = state.snapshot?.documents
      .filter((document) => state.selectedIds.includes(document.id))
      .map((document) => [
        document.id,
        document.path,
        document.sha256,
        document.excerptHash,
      ]);

    return JSON.stringify([
      state.request,
      state.scope,
      state.basis,
      state.reference,
      state.destination,
      state.snapshot?.reference,
      state.answers,
      documents,
    ]);
  }
  consent = (accepted: boolean) => {
    if (!accepted) {
      this.stop();
      this.publish({
        ...this.state,
        phase: this.state.snapshot ? "ready" : this.state.phase,
        consentKey: null,
        result: null,
      });

      return;
    }

    const state = this.state;
    const selectionIssue = organizationSelectionIssue(state.snapshot?.documents.filter(document => state.selectedIds.includes(document.id)) ?? []);
    if (selectionIssue) {
      this.publish({ ...state, consentKey: null, issue: selectionIssue });
      return;
    }

    if (
      state.purpose !== "organize" ||
      state.phase !== "ready" ||
      !state.snapshot ||
      (!state.snapshot.complete && !state.partialAccepted)
      ||
      !state.selectedIds.length
      ||
      hasUnansweredReview(state.questions, state.answers)
    )
      return;

    this.publish({
      ...state,
      consentKey: this.confirmationKey(state),
      result: null,
    });
  };

  send = async (action: LiveOrganizationAction) => {
    const recheck = this.recheck;
    if (!recheck) return;
    await this.transfer(async (state, documents, signal, transmitting) => {
      const owner = state.snapshot?.reference
        ? await recheck(documents, `${state.request}\n${state.basis}`, signal, state.snapshot.reference)
        : await recheck(documents, `${state.request}\n${state.basis}`, signal);
      signal.throwIfAborted();
      transmitting();
      return action({
        requestId: `${Date.now()}:${crypto.randomUUID()}`, owner, consent: true,
        request: state.request, basis: state.basis, scope: state.scope!,
        reference: state.reference, destination: state.destination, documents,
        ...(state.answers.length ? { answers: state.answers } : {}),
        ...(state.snapshot?.reference ? { referenceTree: state.snapshot.reference } : {}),
      });
    });
  };

  /** 서버가 카탈로그 원문과 세션을 확인하는 전송도 같은 동의·검토 상태를 사용한다. */
  sendPrepared = async (action: (state: OrganizationPreparationState) => Promise<LiveOrganizationResult>) => {
    await this.transfer(async (state, _documents, _signal, transmitting) => {
      transmitting();
      return action(state);
    });
  };

  private transfer = async (action: (
    state: OrganizationPreparationState,
    documents: readonly SnapshotDocument[],
    signal: AbortSignal,
    transmitting: () => void,
  ) => Promise<LiveOrganizationResult>) => {
    const state = this.state;
    const selectionIssue = organizationSelectionIssue(state.snapshot?.documents.filter(document => state.selectedIds.includes(document.id)) ?? []);
    if (selectionIssue) {
      this.publish({ ...state, consentKey: null, issue: selectionIssue });
      return;
    }

    if (
      state.purpose !== "organize" ||
      state.phase !== "ready" ||
      !state.snapshot ||
      !state.scope ||
      !state.selectedIds.length
      ||
      (!state.snapshot.complete && !state.partialAccepted)
      ||
      state.consentKey !== this.confirmationKey(state)
      ||
      hasUnansweredReview(state.questions, state.answers)
    )
      return;

    this.stop();

    const sequence = this.sequence;
    const abort = new AbortController();

    this.abort = abort;

    const documents = state.snapshot.documents.filter((document) =>
      state.selectedIds.includes(document.id),
    );

    this.publish({ ...state, phase: "checking", result: null, issue: null });

    let transmitted = false;

    try {
      const result = await action(state, documents, abort.signal, () => {
        if (sequence !== this.sequence || abort.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        this.publish({ ...this.state, phase: "sending", consentKey: null });
        transmitted = true;
      });

      if (sequence !== this.sequence || abort.signal.aborted) return;

      if (!result.ok && result.code === "session") {
        this.reset();
        this.publish({
          ...initial,
          phase: "error",
          issue: LIVE_AI_MESSAGES.session,
        });

        return;
      }

      const needsBasis = result.ok && !result.organization.matches.length && !result.organization.held.length;
      let issue: string | null = null;
      if (result.ok) {
        if (needsBasis) issue = result.organization.summary;
      } else {
        issue = result.questions?.length ? ORGANIZATION_RECOVERY_MESSAGE : result.reason ? LIVE_AI_REASON_MESSAGES[result.reason] : LIVE_AI_MESSAGES[result.code];
      }
      this.publish({
        ...this.state,
        phase: result.ok && !needsBasis ? "review" : "ready",
        conversationStep: needsBasis ? "basis" : this.state.conversationStep,
        reviewConfirmed: result.ok && !needsBasis && !result.organization.held.length,
        consentKey: null,
        result: result.ok ? result : null,
        questions: needsBasis ? [] : result.ok || result.questions?.length
          ? [
            ...new Map(
              [...this.state.questions, ...(result.questions ?? [])].map(
                (question) => [question.id, question],
              ),
            ).values(),
          ]
          : this.state.questions,
        issue,
      });
    } catch (error) {
      if (sequence !== this.sequence || abort.signal.aborted) return;

      this.publish({
        ...this.state,
        phase: transmitted ? "ready" : "error",
        consentKey: null,
        result: null,
        snapshot: transmitted ? state.snapshot : null,
        conversationStep: transmitted ? null : this.nextConversationStep(),
        issue: transmitted
          ? LIVE_AI_MESSAGES.unavailable
          : "원본 내용이나 읽기 권한을 다시 확인해야 해요. 자료를 다시 준비하고 발췌를 확인해 주세요.",
      });

      if (!transmitted) {
        if (
          error instanceof DOMException &&
          ["NotAllowedError", "SecurityError"].includes(error.name)
        )
          this.permissionLost();
      }
    } finally {
      if (sequence === this.sequence) this.abort = null;
    }
  };

  answer = (answer: ReviewAnswer) => {
    this.applyAnswers([answer]);
  };

  updateReply = (replyDraft: string) => {
    if (["reading", "checking", "sending"].includes(this.state.phase)) return;

    this.publish({ ...this.state, replyDraft });
  };

  submitReply = () => {
    const state = this.state;

    if (
      !state.snapshot ||
      !state.questions.length ||
      !["ready", "review"].includes(state.phase)
    )
      return;

    try {
      const answers = parseOrganizationReply(
        state.replyDraft,
        state.questions,
        state.snapshot.documents
          .filter((document) => state.selectedIds.includes(document.id))
          .map((document) => ({
            ...document,
            sourcePath: document.path.slice(0, -1),
          })),
      );

      if (this.applyAnswers(answers))
        this.publish({
          ...this.state,
          replyDraft: "",
          submittedReply: state.replyDraft.trim(),
        });
    } catch {
      this.publish({
        ...state,
        issue:
          "답변을 하나로 정하지 못했어요. 파일 이름과 날짜 기준 또는 ‘폴더명 폴더로’를 적거나 아래 선택 입력을 사용해 주세요.",
      });
    }
  };

  private applyAnswers = (changes: readonly ReviewAnswer[]) => {
    if (
      !this.state.snapshot
      ||
      changes.some(
        (answer) =>
          !this.state.questions.some(
            (question) => question.documentId === answer.documentId,
          ),
      )
    )
      return false;

    try {
      const merged = new Map(
        this.state.answers.map((answer) => [answer.documentId, answer]),
      );

      for (const answer of changes) {
        const previous = merged.get(answer.documentId);

        merged.set(
          answer.documentId,
          previous && !previous.exclude && !answer.exclude
            ? {
              ...previous,
              ...answer,
              ...(answer.date === null ? { dateLabel: undefined } : {}),
            }
            : answer,
        );
      }

      const answers = validateReviewAnswers(
        [...merged.values()],
        this.state.snapshot.documents.map((document) => ({
          ...document,
          sourcePath: document.path.slice(0, -1),
        })),
      );

      this.stop();
      this.publish({
        ...this.state,
        phase: "ready",
        result: null,
        consentKey: null,
        reviewConfirmed: false,
        answers,
        submittedReply: "",
        issue: null,
      });

      return true;
    } catch {
      this.publish({
        ...this.state,
        issue: "답변의 날짜 근거나 목적지 경로를 확인해 주세요.",
      });

      return false;
    }
  };

  clearAnswer = (documentId: string) => {
    this.stop();
    this.publish({
      ...this.state,
      phase: "ready",
      result: null,
      consentKey: null,
      submittedReply: "",
      answers: this.state.answers.filter(
        (answer) => answer.documentId !== documentId,
      ),
      reviewConfirmed: false,
    });
  };

  confirmReview = () => {
    if (!["ready", "review"].includes(this.state.phase)
      || hasUnansweredReview(this.state.questions, this.state.answers)) return;

    this.publish({ ...this.state, reviewConfirmed: true });
  };
  editReview = () => {
    if (!["ready", "review"].includes(this.state.phase)) return;

    this.publish({ ...this.state, reviewConfirmed: false, consentKey: null });
  };
  browseAnswers = async (documentIds: readonly string[]) => {
    if (!["ready", "review"].includes(this.state.phase)) return;

    const targets = [...new Set(documentIds)].filter(id =>
      this.state.questions.some(question => question.documentId === id && question.kind === "destination")
      && !this.state.answers.some(answer => answer.documentId === id && answer.exclude));

    if (!targets.length || targets.some(id => !this.state.selectedIds.includes(id))) return;

    this.answerTargets = targets;
    this.publish({ ...this.state, picking: "answer", issue: null });
    const answer = targets.length === 1
      ? this.state.answers.find(answer => answer.documentId === targets[0])
      : undefined;
    await this.picker.show([...(this.state.destination ?? []), ...(answer?.destination ?? [])]);
  };

  browse = async (picking: FolderChoice) => {
    this.publish({ ...this.state, picking });

    const path =
      picking === "scope"
        ? this.state.scope?.kind === "folder"
          ? this.state.scope.path
          : []
        : (this.state[picking] ?? []);

    await this.picker.show(path);
  };
  chooseFolder = () => {
    const { picking } = this.state;
    const path = this.picker.selectedPath();

    if (!picking || !path) return;

    if (picking === "answer") {
      const base = this.state.destination ?? [];
      if (!base.every((part, index) => path[index] === part) || path.length <= base.length) {
        this.publish({ ...this.state, issue: "최종 목적지 안의 하위 폴더를 선택해 주세요." });
        return;
      }

      this.chooseAnswerFolder(path.slice(base.length));
      return;
    }

    this.update(
      picking === "scope"
        ? { scope: { kind: "folder", path } }
        : { [picking]: path },
    );
    this.closePicker();
  };
  chooseAnswerFolder = (destination: readonly string[]) => {
    if (this.state.picking !== "answer" || !["ready", "review"].includes(this.state.phase)) return;

    const targets = this.answerTargets.filter(id => !this.state.answers.some(answer => answer.documentId === id && answer.exclude));
    if (!targets.length) return;
    if (this.applyAnswers(targets.map(documentId => ({ documentId, destination: [...destination] })))) this.closePicker();
  };
  closePicker = () => {
    this.answerTargets = [];
    this.picker.close();
    this.publish({ ...this.state, picking: null });
  };
  cancel = () => {
    const transmitted = this.state.phase === "sending";
    const reading = this.state.phase === "reading";

    this.stop();
    this.publish({
      ...this.state,
      phase: "draft",
      conversationStep: this.state.purpose === "organize" ? this.nextConversationStep() : null,
      snapshot: null,
      selectedIds: [],
      candidateIds: [],
      consentKey: null,
      partialAccepted: false,
      result: null,
      answers: [],
      questions: [],
      replyDraft: "",
      submittedReply: "",
      issue: transmitted
        ? "결과 기다리기를 중지했어요. 이미 전송한 요청의 사용량은 반환되지 않을 수 있어요."
        : reading
          ? "자료 읽기를 중지했어요."
          : "전송 준비를 중지했어요.",
    });
  };
  reset = () => {
    this.stop();
    this.explicitConditions.clear();
    this.questionHistory = [];
    this.answerTargets = [];
    this.picker.close();
    this.publish(initial);
  };
}

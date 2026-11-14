import { selectOrganizationCandidates } from "../../../shared/organization-candidates";
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
  type LiveOrganizationAction,
  type LiveOrganizationResult,
} from "../../../shared/live-organization";
import type { ConnectionOwner } from "../types";
import type { SnapshotDocument } from "./source-snapshot-rules";
import { parseOrganizationReply } from "./organization-reply";

type Conditions = Readonly<{
  purpose: "organize" | "grounded";
  request: string;
  scope: OrganizationScope | null;
  basis: string;
  reference: readonly string[] | null;
  destination: readonly string[] | null;
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
    picking: FolderChoice | null;
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
  phase: "draft",
  submittedRequest: "",
  snapshot: null,
  candidateIds: [],
  selectedIds: [],
  partialAccepted: false,
  consentKey: null,
  issue: null,
  picking: null,
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
  readonly picker: DestinationPickerController;

  constructor(
    private readonly read: (
      scope: OrganizationScope,
      instruction: string,
      signal: AbortSignal,
      reference?: readonly string[],
    ) => Promise<SourceSnapshot>,
    readFolder: (
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

    const next = { ...this.state, ...change };

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

    this.publish({
      ...next,
      phase: "draft",
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
    if (!this.state.snapshot || !this.state.candidateIds.includes(id)) return;

    this.stop();

    const selectedIds = this.state.selectedIds.includes(id)
      ? this.state.selectedIds.filter((value) => value !== id)
      : [...this.state.selectedIds, id];

    this.publish({
      ...this.state,
      phase: "ready",
      selectedIds,
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
    const state = this.state;

    if (
      state.purpose !== "organize" ||
      state.phase !== "ready" ||
      !state.snapshot ||
      !state.scope ||
      !this.recheck
      ||
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
      const owner = state.snapshot.reference
        ? await this.recheck(
          documents,
          `${state.request}\n${state.basis}`,
          abort.signal,
          state.snapshot.reference,
        )
        : await this.recheck(
          documents,
          `${state.request}\n${state.basis}`,
          abort.signal,
        );

      if (sequence !== this.sequence || abort.signal.aborted) return;

      this.publish({ ...this.state, phase: "sending", consentKey: null });
      transmitted = true;

      const result = await action({
        requestId: `${Date.now()}:${crypto.randomUUID()}`,
        owner,
        consent: true,
        request: state.request,
        basis: state.basis,
        scope: state.scope,
        reference: state.reference,
        destination: state.destination,
        documents,
        ...(state.answers.length ? { answers: state.answers } : {}),
        ...(state.snapshot.reference
          ? { referenceTree: state.snapshot.reference }
          : {}),
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

      this.publish({
        ...this.state,
        phase: result.ok ? "review" : "ready",
        consentKey: null,
        result: result.ok ? result : null,
        questions: result.ok
          ? [
            ...new Map(
              [...this.state.questions, ...(result.questions ?? [])].map(
                (question) => [question.id, question],
              ),
            ).values(),
          ]
          : this.state.questions,
        issue: result.ok ? null : LIVE_AI_MESSAGES[result.code],
      });
    } catch (error) {
      if (sequence !== this.sequence || abort.signal.aborted) return;

      this.publish({
        ...this.state,
        phase: transmitted ? "ready" : "error",
        consentKey: null,
        result: null,
        snapshot: transmitted ? state.snapshot : null,
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
    });
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

    this.update(
      picking === "scope"
        ? { scope: { kind: "folder", path } }
        : { [picking]: path },
    );
    this.closePicker();
  };
  closePicker = () => {
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
    this.picker.close();
    this.publish(initial);
  };
}

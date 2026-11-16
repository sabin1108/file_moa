import {
  confirmFindQuery,
  inferFindRequest,
  type FindFilters,
  type FindQuery,
  type FindResult,
} from "./document-find";
import type { OrganizationScope } from "../../organization/source-snapshot-rules";
import { copyFolderPath } from "../../folder-path";
import { parseFindReply } from "./document-find-reply";
import { confirmSemanticQuery } from "../semantic/semantic-query";

const initial = {
  phase: "idle" as
    | "idle"
    | "confirm"
    | "searching"
    | "ready"
    | "error"
    | "cancelled",
  request: "",
  draft: "",
  filters: inferFindRequest(""),
  scope: { kind: "all" } as OrganizationScope,
  result: null as FindResult | null,
  issue: null as string | null,
  submittedReply: "",
  selectedPaths: [] as readonly (readonly string[])[],
  semantic: { enabled: false, meaning: "", confirmed: false },
  referenceYear: null as number | null,
};

export type DocumentFindState = typeof initial;

/** Provider 수명의 로컬 찾기 상태. 파일 접근은 주입된 session reader만 수행한다. */

export class DocumentFindController {
  private state = initial;
  private listeners = new Set<() => void>();
  private generation = 0;
  private abort: AbortController | null = null;
  private referenceYear: number | null = null;
  constructor(
    private readonly read: (
      scope: OrganizationScope,
      query: FindQuery,
      signal: AbortSignal,
    ) => Promise<FindResult>,
    private readonly permissionLost: () => void = () => { },
    private readonly getReferenceYear: () => number,
  ) { }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DocumentFindState) {
    this.state = { ...state, referenceYear: this.referenceYear };
    this.listeners.forEach((listener) => listener());
  }
  private stop() {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
  }
  private ensureReferenceYear() {
    return this.referenceYear ??= this.getReferenceYear();
  }
  start = (request: string) => {
    this.stop();
    this.referenceYear = this.getReferenceYear();
    this.publish({
      ...initial,
      phase: "confirm",
      request: request.trim(),
      draft: request,
      filters: inferFindRequest(request, this.referenceYear),
      semantic: { enabled: false, meaning: request.trim(), confirmed: false },
    });
  };
  updateDraft = (draft: string) => this.publish({ ...this.state, draft });
  submitReply = (reply: string) => {
    const parsed = parseFindReply(reply, this.ensureReferenceYear());

    if (parsed.kind === "none") return false;

    if (parsed.kind === "invalid") {
      this.publish({ ...this.state, issue: "조건을 전부 확인하지 못했어요. 연도·월·날짜 기준을 나누어 적거나 아래 조건에서 선택해 주세요." });

      return true;
    }

    this.configure(parsed.filters);
    this.publish({ ...this.state, submittedReply: reply.trim(), draft: "" });

    return true;
  };
  configure = (filters: Partial<FindFilters>) => {
    this.stop();
    this.ensureReferenceYear();
    this.publish({
      ...this.state,
      filters: { ...this.state.filters, ...filters },
      phase: "confirm",
      result: null,
      issue: null,
      selectedPaths: [],
      semantic: { ...this.state.semantic, confirmed: false },
    });
  };
  setScope = (path: readonly string[] | null) => {
    this.stop();
    this.ensureReferenceYear();
    this.publish({
      ...this.state,
      scope:
        path === null
          ? { kind: "all" }
          : { kind: "folder", path: copyFolderPath(path) },
      phase: "confirm",
      result: null,
      issue: null,
      selectedPaths: [],
      semantic: { ...this.state.semantic, confirmed: false },
    });
  };
  search = async () => {
    if (this.state.phase === "searching") return;

    const year = this.ensureReferenceYear();

    let query: FindQuery;

    try {
      query = this.state.semantic.enabled
        ? confirmSemanticQuery(this.state.filters, this.state.semantic.meaning, this.state.semantic.confirmed, year)
        : confirmFindQuery(this.state.filters, false, year);
    } catch {
      this.publish({
        ...this.state,
        issue: this.state.semantic.enabled ? "설명 문장과 필수 조건을 확인하고 확인란을 선택해 주세요. 원래 요청의 명시 조건과 기간은 유지해야 해요." : "검색어와 연도·날짜 기준·기간을 확인해 주세요.",
      });

      return;
    }

    this.stop();

    const generation = this.generation,
      abort = new AbortController();

    this.abort = abort;
    this.publish({
      ...this.state,
      phase: "searching",
      issue: null,
      result: null,
      selectedPaths: [],
    });

    try {
      const result = await this.read(this.state.scope, query, abort.signal);

      if (abort.signal.aborted || generation !== this.generation) return;

      this.publish({ ...this.state, phase: "ready", result });
    } catch (error) {
      if (abort.signal.aborted || generation !== this.generation) return;

      this.publish({
        ...this.state,
        phase: "error",
        result: null,
        issue:
          "자료를 찾는 중 읽기 문제가 생겼어요. 폴더 권한과 연결 상태를 확인해 주세요.",
      });

      if (
        error instanceof DOMException &&
        ["NotAllowedError", "SecurityError"].includes(error.name)
      )
        this.permissionLost();
    } finally {
      if (generation === this.generation) this.abort = null;
    }
  };
  configureSemantic = (patch: Partial<DocumentFindState["semantic"]>) => {
    this.stop();
    this.ensureReferenceYear();
    this.publish({ ...this.state, semantic: { ...this.state.semantic, confirmed: false, ...patch }, phase: "confirm", result: null, selectedPaths: [], issue: null });
  };
  cancel = () => {
    this.stop();
    this.publish({
      ...this.state,
      phase: "cancelled",
      result: null,
      selectedPaths: [],
      issue: "검색을 중지했어요.",
    });
  };
  reset = () => {
    this.stop();
    this.referenceYear = null;
    this.publish(initial);
  };
  toggle = (path: readonly string[]) => {
    if (this.state.phase !== "ready"
      || !this.state.result?.documents.some(document => document.contentAvailable !== false && JSON.stringify(document.path) === JSON.stringify(path))) return;

    const selected = this.state.selectedPaths.some(value => JSON.stringify(value) === JSON.stringify(path));

    this.publish({
      ...this.state,
      selectedPaths: selected
        ? this.state.selectedPaths.filter(value => JSON.stringify(value) !== JSON.stringify(path))
        : [...this.state.selectedPaths, copyFolderPath(path)],
    });
  };
}

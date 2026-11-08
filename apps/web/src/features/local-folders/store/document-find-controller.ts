import {
  confirmFindQuery,
  inferFindRequest,
  type FindFilters,
  type FindQuery,
  type FindResult,
} from "../lib/document-find";
import type { OrganizationScope } from "../lib/source-snapshot";
import { copyFolderPath } from "../lib/folder-path";

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
};
export type DocumentFindState = typeof initial;

/** Provider 수명의 로컬 찾기 상태. 파일 접근은 주입된 session reader만 수행한다. */
export class DocumentFindController {
  private state = initial;
  private listeners = new Set<() => void>();
  private generation = 0;
  private abort: AbortController | null = null;
  constructor(
    private readonly read: (
      scope: OrganizationScope,
      query: FindQuery,
      signal: AbortSignal,
    ) => Promise<FindResult>,
    private readonly permissionLost: () => void = () => {},
  ) {}
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DocumentFindState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private stop() {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
  }
  start = (request: string) => {
    this.stop();
    this.publish({
      ...initial,
      phase: "confirm",
      request: request.trim(),
      draft: request,
      filters: inferFindRequest(request),
    });
  };
  updateDraft = (draft: string) => this.publish({ ...this.state, draft });
  configure = (filters: Partial<FindFilters>) => {
    this.stop();
    this.publish({
      ...this.state,
      filters: { ...this.state.filters, ...filters },
      phase: "confirm",
      result: null,
      issue: null,
    });
  };
  setScope = (path: readonly string[] | null) => {
    this.stop();
    this.publish({
      ...this.state,
      scope:
        path === null
          ? { kind: "all" }
          : { kind: "folder", path: copyFolderPath(path) },
      phase: "confirm",
      result: null,
      issue: null,
    });
  };
  search = async () => {
    if (this.state.phase === "searching") return;
    let query: FindQuery;
    try {
      query = confirmFindQuery(this.state.filters);
    } catch {
      this.publish({
        ...this.state,
        issue: "검색어와 연도·날짜 기준·기간을 확인해 주세요.",
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
  cancel = () => {
    this.stop();
    this.publish({
      ...this.state,
      phase: "cancelled",
      result: null,
      issue: "검색을 중지했어요.",
    });
  };
  reset = () => {
    this.stop();
    this.publish(initial);
  };
}

/**
 * 선택한 MD/TXT 한 문서의 열기·갱신·닫기 상태를 관리한다. SourceFolderBrowser가 표시와 초점을 조합한다.
 * 본문 읽기는 session에 맡기고 요청 순번으로 늦은 결과를 차단한다. 목록 요청과는 독립적인 수명을 갖는다.
 */
import type { SourceFilePreview } from "./source-file-preview";
import { sourceFileExpectationSchema, type SourceFileExpectation } from "../../../../shared/grounded-evidence";

export type PreviewIssue = "permission" | "missing" | "read" | "encoding" | "too-large" | "unsupported" | "cancelled" | "changed" | "ocr";

export type SourcePreviewState = Readonly<{
  available: boolean;
  path: readonly string[] | null;
  phase: "idle" | "loading" | "ready" | "error" | "cancelled";
  result: SourceFilePreview | null;
  stale: boolean;
  issue: PreviewIssue | null;
}>;

const initialState: SourcePreviewState = { available: false, path: null, phase: "idle", result: null, stale: false, issue: null };

/** 한 문서의 표시 상태와 요청 수명만 소유한다. read 주입점으로 session을 호출하며 React/파일 API를 모른다. */

export class SourcePreviewController {
  private state = initialState;
  private generation = 0;
  private abort: AbortController | null = null;
  private expectation: SourceFileExpectation | undefined;
  private listeners = new Set<() => void>();
  constructor(
    private readonly read: (path: readonly string[], signal: AbortSignal, expectation?: SourceFileExpectation) => Promise<SourceFilePreview>,
    private readonly onPermissionLost: () => void,
  ) { }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initialState;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: SourcePreviewState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  private invalidate() {
    // 취소 신호를 무시하거나 이미 끝난 I/O도 세대 번호가 달라지면 게시할 수 없다.
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
  }
  reset(available: boolean) {
    this.invalidate();
    this.expectation = undefined;
    this.publish({ ...initialState, available });
  }
  close = () => this.reset(this.state.available);
  suspend() {
    // 폴더 선택이 취소될 수 있으므로 여기서는 마지막 본문을 지우지 않는다.
    this.invalidate();

    const loading = this.state.phase === "loading";

    this.publish({
      ...this.state,
      available: false,
      stale: this.state.result !== null,
      phase: loading ? "cancelled" : this.state.phase,
      issue: loading ? "cancelled" : this.state.issue
    });
  }
  resume(available: boolean, refresh = false) {
    this.publish({ ...this.state, available });

    if (available && refresh && this.state.path) void this.open(this.state.path, this.expectation);
  }
  permissionLost() {
    this.invalidate();
    this.publish({
      ...this.state,
      available: false,
      stale: this.state.result !== null,
      phase: this.state.path ? "error" : "idle",
      issue: this.state.path ? "permission" : null
    });
  }
  open = async (path: readonly string[], expected?: SourceFileExpectation, signal?: AbortSignal): Promise<boolean> => {
    if (!this.state.available || signal?.aborted) return false;

    const expectation = expected ? sourceFileExpectationSchema.parse(expected) : undefined;

    this.invalidate();
    this.expectation = expectation;

    const generation = this.generation;
    const abort = new AbortController();

    this.abort = abort;

    const cancelNavigation = () => {
      if (generation === this.generation) this.close();
    };

    signal?.addEventListener("abort", cancelNavigation, { once: true });

    const requestedPath = [...path];
    // 같은 파일 갱신만 이전 본문을 남긴다. 다른 파일에 이전 내용이 붙는 것을 방지한다.
    const sameFile = this.state.result?.path.length === path.length && this.state.result.path.every((name, i) => name === path[i]);
    const result = sameFile && !expectation ? this.state.result : null;

    this.publish({
      available: true,
      path: requestedPath,
      phase: "loading",
      result,
      stale: result !== null,
      issue: null
    });

    try {
      const next = await this.read(requestedPath, abort.signal, expectation);

      if (generation !== this.generation) return false;

      this.abort = null;
      this.publish({ available: true, path: requestedPath, phase: "ready", result: next, stale: false, issue: null });

      return true;
    } catch (error) {
      if (generation !== this.generation) return false;

      this.abort = null;

      const name = error instanceof Error ? error.name : "";
      const message = error instanceof Error ? error.message : "";
      let issue: PreviewIssue = "read";

      if (name === "NotAllowedError") issue = "permission";
      else if (name === "NotFoundError" || name === "TypeMismatchError") issue = "missing";
      else if (name === "AbortError") issue = "cancelled";
      else if (message === "invalid-utf8") issue = "encoding";
      else if (message === "too-large") issue = "too-large";
      else if (message === "unsupported-extension") issue = "unsupported";
      else if (message.startsWith("ocr-") || message === "pdf-no-text") issue = "ocr";
      else if (["citation-changed", "source-changed", "citation-connection-mismatch"].includes(message)) issue = "changed";

      this.publish({
        ...this.state,
        available: issue !== "permission",
        phase: issue === "cancelled" ? "cancelled" : "error",
        issue
      });

      if (issue === "permission") this.onPermissionLost();

      return false;
    } finally {
      signal?.removeEventListener("abort", cancelNavigation);
    }
  };
  refresh = async () => {
    if (this.state.path) await this.open(this.state.path, this.expectation);
  };
  cancel = () => {
    if (this.state.phase !== "loading") return;

    this.invalidate();
    this.publish({ ...this.state, phase: "cancelled", issue: "cancelled" });
  };
}

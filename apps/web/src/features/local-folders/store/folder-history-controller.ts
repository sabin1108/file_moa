import type { FolderHistory } from "../services/folder-history";
import type { HistoryGroup } from "../lib/folder-history";
import type { HistoryTargetInspection } from "../services/history-target-inspection";
import type { CopyTargetInspection } from "../services/copy-history-inspection";
import type { CopyGroup } from "../lib/copy-journal";
import type { RestoreHistoryGroup } from "../lib/recovery-restore-history";
import type { RestoreObservation } from "../services/restore-history-inspection";

export type RestoreInspectionState = Readonly<{
  id: string;
  phase: "loading" | "ready" | "error" | "cancelled";
  result: RestoreObservation | null
}>;

export type CopyHistoryInspectionState = Readonly<{
  id: string;
  phase: "loading" | "ready" | "error" | "cancelled";
  result: CopyTargetInspection | null
}>;

export type TargetInspectionState = Readonly<{
  id: string;
  phase: "loading" | "ready" | "error" | "cancelled";
  result: HistoryTargetInspection | null;
  issue: "permission" | "record" | "changed" | "missing" | "read" | null;
}>;

export type HistoryIssue = "permission" | "missing" | "location" | "stale" | "read";

export type FolderHistoryState = Readonly<{
  open: boolean;
  path: readonly string[];
  phase: "idle" | "loading" | "ready" | "error" | "cancelled";
  result: FolderHistory | null;
  issue: HistoryIssue | null;
  checkedAt: string | null;
  inspection: TargetInspectionState | null;
  copyInspection: CopyHistoryInspectionState | null;
  restoreInspection: RestoreInspectionState | null;
}>;

const initial: FolderHistoryState = {
  open: false,
  path: [],
  phase: "idle",
  result: null,
  issue: null,
  checkedAt: null,
  inspection: null,
  copyInspection: null,
  restoreInspection: null,
};

/** 팝업의 읽기 요청만 소유한다. 닫기/교체 후 늦은 응답은 게시하지 않는다. */

export class FolderHistoryController {
  private state = initial;
  private generation = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly read: (path: readonly string[], signal: AbortSignal) => Promise<FolderHistory>,
    private readonly inspect?: (path: readonly string[], group: HistoryGroup, signal: AbortSignal) => Promise<HistoryTargetInspection>,
    private readonly inspectCopy?: (path: readonly string[], group: CopyGroup, signal: AbortSignal) => Promise<CopyTargetInspection>,
    private readonly inspectRestore?: (path: readonly string[], group: RestoreHistoryGroup, signal: AbortSignal) => Promise<RestoreObservation>) { }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: FolderHistoryState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  private invalidate() {
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
  }
  close = () => {
    this.invalidate();
    this.publish(initial);
  };
  dispose = () => {
    this.invalidate();
  };
  cancel = () => {
    if (this.state.phase !== "loading") return;

    this.invalidate();
    this.publish({ ...this.state, phase: "cancelled", result: null });
  };
  open = async (path: readonly string[]) => {
    this.invalidate();

    const generation = this.generation;
    const abort = new AbortController();

    this.abort = abort;

    const requestedPath = [...path];

    this.publish({ ...initial, open: true, path: requestedPath, phase: "loading" });

    try {
      const result = await this.read(requestedPath, abort.signal);

      if (generation !== this.generation) return;

      this.abort = null;
      this.publish({ ...this.state, phase: "ready", result, checkedAt: new Date().toISOString() });
    } catch (error) {
      if (generation !== this.generation) return;

      this.abort = null;

      const name = error instanceof Error ? error.name : "";
      const message = error instanceof Error ? error.message : "";
      let issue: HistoryIssue = "read";

      if (name === "NotAllowedError" || name === "SecurityError") issue = "permission";
      else if (name === "NotFoundError") issue = "missing";
      else if (message === "history-not-directory") issue = "location";
      else if (message === "stale-connection-operation" || message === "source-folder-not-connected") issue = "stale";

      this.publish({ ...this.state, phase: name === "AbortError" ? "cancelled" : "error", issue, result: null });
    }
  };
  refresh = () => this.state.open ? this.open(this.state.path) : Promise.resolve();

  cancelInspection = () => {
    if (this.state.inspection?.phase !== "loading") return;

    this.invalidate();
    this.publish({ ...this.state, inspection: { ...this.state.inspection, phase: "cancelled", result: null } });
  };
  inspectTarget = async (id: string) => {
    if (!this.inspect || !this.state.open || this.state.phase !== "ready") return;

    const group = this.state.result?.groups.find(group => group.id === id);

    if (!group || group.status !== "uncertain" || !group.path || !group.kind) return;
    // 목록 읽기와 대상 확인을 한 요청 수명에 두어 새로고침/닫기가 둘 다 폐기한다.

    this.invalidate();

    const generation = this.generation, abort = new AbortController();

    this.abort = abort;
    this.publish({
      ...this.state,
      restoreInspection: null,
      copyInspection: null,
      inspection: { id, phase: "loading", result: null, issue: null }
    });

    try {
      const result = await this.inspect(this.state.path, group, abort.signal);

      if (generation !== this.generation) return;

      this.abort = null;
      this.publish({ ...this.state, inspection: { id, phase: "ready", result, issue: null } });
    } catch (error) {
      if (generation !== this.generation) return;

      this.abort = null;

      const name = error instanceof Error ? error.name : "", message = error instanceof Error ? error.message : "";
      const issue = name === "NotAllowedError" || name === "SecurityError"
        ? "permission"
        : message === "history-record-changed"
          ? "record"
          : message === "history-target-changed" ? "changed"
            : name === "NotFoundError" ? "missing" : "read";

      this.publish({
        ...this.state,
        inspection: { id, phase: name === "AbortError" ? "cancelled" : "error", issue, result: null }
      });
    }
  };

  cancelCopyInspection = () => {
    if (this.state.copyInspection?.phase !== "loading") return;

    this.invalidate();
    this.publish({
      ...this.state,
      copyInspection: { ...this.state.copyInspection, phase: "cancelled", result: null }
    });
  };
  inspectCopyTarget = async (id: string) => {
    if (!this.inspectCopy || !this.state.open || this.state.phase !== "ready" || this.state.result?.copies?.incomplete) return;

    const group = this.state.result?.copies?.groups.find(g => g.id === id);

    if (!group?.items.length) return;

    this.invalidate();

    const generation = this.generation, abort = new AbortController();

    this.abort = abort;
    this.publish({
      ...this.state,
      restoreInspection: null,
      inspection: null,
      copyInspection: { id, phase: "loading", result: null }
    });

    try {
      const result = await this.inspectCopy(this.state.path, group, abort.signal);

      if (generation !== this.generation) return;

      this.abort = null;
      this.publish({ ...this.state, copyInspection: { id, phase: "ready", result } });
    } catch (error) {
      if (generation !== this.generation) return;

      this.abort = null;
      this.publish({
        ...this.state,
        copyInspection: {
          id,
          phase: error instanceof Error && error.name === "AbortError" ? "cancelled" : "error",
          result: null,
        },
      });
    }
  };

  inspectRestoreTarget = async (id: string) => {
    if (!this.inspectRestore || !this.state.open || this.state.phase !== "ready" || this.state.result?.restores?.incomplete) return;

    if (this.state.restoreInspection?.id === id && this.state.restoreInspection.phase === "loading") {
      this.invalidate();
      this.publish({ ...this.state, restoreInspection: { id, phase: "cancelled", result: null } });

      return;
    }

    const group = this.state.result?.restores?.groups.find(value => value.id === id);

    if (!group?.to || !group.sha256 || group.status !== "completed" || group.fileStatus !== "verified") return;

    this.invalidate();

    const generation = this.generation;
    const abort = new AbortController();

    this.abort = abort;
    this.publish({
      ...this.state,
      inspection: null,
      copyInspection: null,
      restoreInspection: { id, phase: "loading", result: null }
    });

    try {
      const result = await this.inspectRestore(this.state.path, group, abort.signal);

      if (generation !== this.generation) return;

      this.abort = null;
      this.publish({ ...this.state, restoreInspection: { id, phase: "ready", result } });
    } catch (error) {
      if (generation !== this.generation) return;

      this.abort = null;
      this.publish({
        ...this.state,
        restoreInspection: {
          id,
          phase: error instanceof Error && error.name === "AbortError" ? "cancelled" : "error",
          result: null
        }
      });
    }
  };
}

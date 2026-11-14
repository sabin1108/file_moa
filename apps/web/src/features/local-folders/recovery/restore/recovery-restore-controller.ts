import type { RestoreExecution, RestorePreview } from "./recovery-restore-rules";
import type { FolderListing } from "../../browsing/source-folder-listing";
import { DestinationPickerController } from "../../destination-picker/destination-picker-controller";

export type RecoveryRestoreState = Readonly<{
  phase: "idle" | "choosing" | "preparing" | "ready" | "running" | "completed" | "cancelled" | "error";
  id: string | null;
  preview: RestorePreview | null;
  result: RestoreExecution | null;
  cancelling: boolean;
  issue: "permission" | "source" | "destination" | "read" | "interrupted" | null;
}>;

const initial: RecoveryRestoreState = { phase: "idle", id: null, preview: null, result: null, cancelling: false, issue: null };

/** 위치 탐색/승인/실행 수명만 소유한다. 디스크와 내부 승인 보관은 session에 맡긴다. */

export class RecoveryRestoreController {
  readonly picker: DestinationPickerController;
  private state = initial;
  private abort: AbortController | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(read: (path: readonly string[], signal: AbortSignal) => Promise<FolderListing>,
    private readonly prepare: (id: string, path: readonly string[], signal: AbortSignal) => Promise<RestorePreview>,
    private readonly run: (view: RestorePreview, signal: AbortSignal, progress: (value: RestoreExecution) => void) => Promise<RestoreExecution>,
    private readonly discard: () => void = () => { }) {
    this.picker = new DestinationPickerController(read, () => {
      this.publish({ ...this.state, phase: "error", issue: "permission" });
    });
  }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: RecoveryRestoreState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  private invalidate() {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.discard();
  }
  dispose = () => {
    this.invalidate();
    this.picker.close();
    this.publish(initial);
  };
  reset = () => {
    if (this.state.phase === "running") {
      this.cancel();

      return;
    }

    this.dispose();
  };
  open = async (id: string, path: readonly string[]) => {
    if (this.state.phase === "running") return;

    this.invalidate();
    this.publish({ ...initial, phase: "choosing", id });
    await this.picker.show(path);
  };
  resume = async (id: string, path: readonly string[], step: string, interrupted: boolean, outcome?: RestoreExecution) => {
    await this.open(id, path);

    if (outcome && !interrupted && step === "result") {
      this.picker.close();
      this.publish({
        ...this.state,
        phase: outcome.phase === "completed" && outcome.journalComplete && outcome.status === "verified"
          ? "completed"
          : outcome.phase === "cancelled" ? "cancelled" : "error",
        result: outcome
      });
    } else if (interrupted || ["execute", "result", "preserve"].includes(step)) {
      this.picker.close();
      this.publish({ ...this.state, phase: "error", issue: "interrupted" });
    } else if (step === "review") await this.chooseDestination();
  };
  browse = () => this.state.id ? this.open(this.state.id, this.state.preview?.destination ?? []) : Promise.resolve();
  chooseDestination = async () => {
    if (this.state.phase === "running" || !this.state.id) return;

    const path = this.picker.selectedPath();

    if (!path) return;

    const id = this.state.id;

    this.invalidate();
    this.picker.close();

    const generation = this.generation;
    const abort = new AbortController();

    this.abort = abort;
    this.publish({ ...initial, phase: "preparing", id });

    try {
      const preview = await this.prepare(id, path, abort.signal);

      if (generation !== this.generation) return;

      this.abort = null;
      this.publish({ ...this.state, phase: "ready", preview });
    } catch (error) {
      if (generation !== this.generation) return;

      this.abort = null;

      if (error instanceof Error && error.message === "stale-connection-operation") {
        this.dispose();

        return;
      }

      const message = error instanceof Error ? error.message : "";
      const issue = error instanceof Error && error.name === "NotAllowedError"
        ? "permission"
        : message.includes("source") || message.includes("record") || message.includes("backup")
          ? "source"
          : message.includes("destination") || message.includes("name") || message.includes("path") ? "destination" : "read";

      this.publish({ ...this.state, phase: abort.signal.aborted ? "cancelled" : "error", issue });
    }
  };
  cancel = () => {
    this.abort?.abort();

    if (this.state.phase === "running") this.publish({ ...this.state, cancelling: true });
    else {
      this.invalidate();
      this.publish({ ...this.state, phase: "cancelled", preview: null });
    }
  };
  start = async () => {
    if (this.state.phase !== "ready" || !this.state.preview) return;

    const view = this.state.preview;
    const generation = ++this.generation;
    const abort = new AbortController();

    this.abort = abort;
    this.publish({ ...this.state, phase: "running", result: null, issue: null });

    try {
      const result = await this.run(view, abort.signal, value => {
        if (generation === this.generation) this.publish({ ...this.state, result: value });
      });

      if (generation !== this.generation) return;

      this.abort = null;

      const phase = result.phase === "completed" && result.journalComplete && result.status === "verified"
        ? "completed"
        : result.phase === "cancelled" ? "cancelled" : "error";

      this.publish({ ...this.state, phase, result, cancelling: false });
    } catch (error) {
      if (generation !== this.generation) return;

      this.abort = null;

      if (error instanceof Error && error.message === "stale-connection-operation") {
        this.dispose();

        return;
      }

      this.publish({ ...this.state, phase: "error", issue: "read", cancelling: false });
    }
  };
}

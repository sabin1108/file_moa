import { managedIssue, type ManagedRequest, type ManagedPreview, type ManagedResult } from "../lib/managed-files";
import type { ManagedArchiveView } from "../services/managed-archive";
import type { FolderListing } from "../services/source-folder-listing";
import { DestinationPickerController } from "./destination-picker-controller";

type Editor = Readonly<{
  id: string;
  text: string;
  path: string[]
}>;

export type ManagedFilesState = Readonly<{
  open: boolean;
  mode: "operation" | "archives";
  phase: "idle" | "loading" | "draft" | "preparing" | "ready" | "running" | "completed" | "cancelled" | "error";
  request: ManagedRequest | null;
  preview: ManagedPreview | null;
  result: ManagedResult | null;
  editor: Editor | null;
  text: string;
  issue: string | null;
  cancelling: boolean;
  archives: readonly ManagedArchiveView[];
  truncated: boolean;
  unreadable: number;
  destinationConfirmed: boolean;
}>;

const initial: ManagedFilesState = {
  open: false,
  mode: "operation",
  phase: "idle",
  request: null,
  preview: null,
  result: null,
  editor: null,
  text: "",
  issue: null,
  cancelling: false,
  archives: [],
  truncated: false,
  unreadable: 0,
  destinationConfirmed: false
};

/** 조합된 작업 화면의 읽기/승인/실행 수명. 파일 접근과 승인 핸들은 session에만 있다. */

export class ManagedFilesController {
  readonly picker: DestinationPickerController;
  private state = initial;
  private sequence = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(read: (path: readonly string[], signal: AbortSignal) => Promise<FolderListing>,
    private readonly editor: (path: readonly string[], signal: AbortSignal) => Promise<Editor>,
    private readonly prepare: (request: ManagedRequest, signal: AbortSignal) => Promise<ManagedPreview>,
    private readonly run: (view: ManagedPreview, signal: AbortSignal, progress: (value: ManagedResult) => void) => Promise<ManagedResult>,
    private readonly archives: (signal: AbortSignal) => Promise<{
      items: ManagedArchiveView[];
      truncated: boolean;
      unreadable: number
    }>,
    private readonly discard: () => void) {
    this.picker = new DestinationPickerController(read, () => { });
  }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(value: ManagedFilesState) {
    this.state = value;
    this.listeners.forEach(listener => listener());
  }
  private invalidate() {
    this.sequence++;
    this.abort?.abort();
    this.abort = null;
    this.discard();
  }
  dispose = () => {
    this.invalidate();
    this.picker.close();
    this.publish(initial);
  };
  close = () => {
    if (this.state.phase === "running") {
      this.cancel();

      return false;
    }

    this.dispose();

    return true;
  };
  cancel = () => {
    this.abort?.abort();

    if (this.state.phase === "running") this.publish({ ...this.state, cancelling: true });
    else {
      this.invalidate();
      this.publish({ ...this.state, phase: "cancelled" });
    }
  };
  open = async (request: ManagedRequest, destinationConfirmed = false) => {
    if (this.state.phase === "running") return;

    this.invalidate();
    this.picker.close();
    this.publish({
      ...initial,
      open: true,
      request: structuredClone(request),
      destinationConfirmed,
      phase: request.kind === "edit" ? "loading" : "draft"
    });

    if (request.kind === "edit") {
      const sequence = this.sequence;
      const abort = new AbortController();

      this.abort = abort;

      try {
        const value = await this.editor([...request.source, request.names[0]], abort.signal);

        if (sequence !== this.sequence) return;

        this.abort = null;
        this.publish({ ...this.state, phase: "draft", editor: value, text: value.text });
      } catch (error) {
        if (sequence === this.sequence) this.publish({ ...this.state, phase: "error", issue: managedIssue(error) });
      }
    } else if (request.kind === "recover") await this.browse();
  };
  browse = async (path?: readonly string[]) => {
    if (!this.state.request || this.state.phase === "running") return;

    this.discard();
    this.publish({ ...this.state, preview: null, result: null, issue: null, phase: "draft" });
    await this.picker.show(path ?? this.state.request.destination);
  };
  choose = async () => {
    const path = this.picker.selectedPath();

    if (!path || !this.state.request) return;

    this.picker.close();
    this.publish({ ...this.state, request: { ...this.state.request, destination: path }, destinationConfirmed: true });

    if (this.state.request?.kind === "recover") await this.review();
  };
  setOperation = (kind: "copy" | "move") => {
    if (!this.state.request || !["copy", "move"].includes(this.state.request.kind) || this.state.phase === "running") return;

    this.invalidate();
    this.picker.close();
    this.publish({
      ...this.state,
      request: { ...this.state.request, kind },
      phase: "draft",
      preview: null,
      result: null,
      issue: null
    });
  };
  setText = (text: string) => {
    if (this.state.phase !== "draft") return;

    this.discard();
    this.publish({ ...this.state, text, preview: null, result: null });
  };
  backToDraft = () => {
    if (this.state.phase === "running") return;

    this.discard();
    this.publish({ ...this.state, phase: "draft", preview: null, result: null, issue: null });
  };
  review = async () => {
    if (!this.state.request || !["draft", "error", "cancelled"].includes(this.state.phase)) return;

    if (["copy", "move"].includes(this.state.request.kind) && !this.state.destinationConfirmed) return;

    this.invalidate();

    const sequence = this.sequence;
    const abort = new AbortController();

    this.abort = abort;

    const request = this.state.editor ? { ...this.state.request, text: this.state.text, editId: this.state.editor.id } : this.state.request;

    this.publish({ ...this.state, phase: "preparing", preview: null, result: null, issue: null });

    try {
      const preview = await this.prepare(request, abort.signal);

      if (sequence !== this.sequence) return;

      this.abort = null;
      this.publish({ ...this.state, phase: "ready", preview });
    } catch (error) {
      if (sequence !== this.sequence) return;

      this.abort = null;

      if (error instanceof Error && error.message === "stale-connection-operation") {
        this.dispose();

        return;
      }

      this.publish({ ...this.state, phase: abort.signal.aborted ? "cancelled" : "error", issue: managedIssue(error) });
    }
  };
  start = async () => {
    if (this.state.phase !== "ready" || !this.state.preview) return;

    const sequence = ++this.sequence;
    const abort = new AbortController();

    this.abort = abort;

    const view = this.state.preview;

    this.publish({ ...this.state, phase: "running", result: null, cancelling: false });

    try {
      const result = await this.run(view, abort.signal, value => {
        if (sequence === this.sequence) this.publish({ ...this.state, result: value });
      });

      if (sequence !== this.sequence) return;

      this.abort = null;
      this.publish({
        ...this.state,
        phase:
          result.phase === "completed"
            ? "completed"
            : result.phase === "cancelled"
              ? "cancelled"
              : "error",
        result,
        cancelling: false,
        issue: result.issue,
      });
    } catch (error) {
      if (sequence === this.sequence && error instanceof Error && error.message === "stale-connection-operation") {
        this.dispose();

        return;
      }

      if (sequence === this.sequence) this.publish({ ...this.state, phase: "error", issue: managedIssue(error), cancelling: false });
    }
  };
  showArchives = async () => {
    if (this.state.phase === "running") return;

    this.invalidate();
    this.picker.close();

    const sequence = this.sequence;
    const abort = new AbortController();

    this.abort = abort;
    this.publish({ ...initial, open: true, mode: "archives", phase: "loading" });

    try {
      const result = await this.archives(abort.signal);

      if (sequence !== this.sequence) return;

      this.abort = null;
      this.publish({
        ...this.state,
        phase: "ready",
        archives: result.items,
        truncated: result.truncated,
        unreadable: result.unreadable
      });
    } catch (error) {
      if (sequence === this.sequence) this.publish({ ...this.state, phase: "error", issue: managedIssue(error) });
    }
  };
  recover = (archive: ManagedArchiveView) => this.open({
    kind: "recover",
    source: [],
    names: [],
    destination: [],
    archiveId: archive.id
  });

  resume = async (
    request: ManagedRequest,
    step: string,
    interrupted: boolean,
    outcome?: ManagedResult,
    confirmed = false,
    choosing = false,
    pickerPath?: readonly string[]) => {
    await this.open(request);
    this.publish({ ...this.state, destinationConfirmed: confirmed || step === "review" });

    if (outcome && !interrupted && step === "result") {
      this.picker.close();
      this.publish({
        ...this.state,
        phase: outcome.phase === "completed" ? "completed" : outcome.phase === "cancelled" ? "cancelled" : "error",
        result: outcome
      });
    } else if (interrupted || step === "execute" || step === "preserve" || step === "result") {
      this.picker.close();
      this.publish({ ...this.state, phase: "error", issue: "workflow-interrupted" });
    } else if (step === "review") {
      this.picker.close();
      await this.review();
    } else if (choosing) await this.browse(pickerPath);
  };
}

import { copyFolderPath } from "../lib/folder-path";
import type { FolderListing } from "../services/source-folder-listing";

export type DestinationPickerState = Readonly<{
  open: boolean;
  phase: "idle" | "loading" | "ready" | "error";
  result: FolderListing | null;
  requestedPath: readonly string[];
  issue: "missing" | "read" | null;
}>;

const initial: DestinationPickerState = { open: false, phase: "idle", result: null, requestedPath: [], issue: null };

/** 계획 안의 목적지 탐색만 소유한다. 본문/쓰기/주 목록/브라우저 history에 접근하지 않는다. */

export class DestinationPickerController {
  private state = initial;
  private generation = 0;
  private abort: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly read: (path: readonly string[], signal: AbortSignal) => Promise<FolderListing>,
    private readonly onPermissionLost: () => void) { }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DestinationPickerState) {
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
  show = async (path: readonly string[]) => {
    await this.load(path);
  };
  private async load(path: readonly string[]) {
    this.invalidate();

    const generation = this.generation;
    const abort = new AbortController();

    this.abort = abort;
    this.publish({ ...this.state, open: true, phase: "loading", requestedPath: [...path], issue: null });

    try {
      const result = await this.read(copyFolderPath(path), abort.signal);

      if (generation !== this.generation) return;

      this.abort = null;
      this.publish({ open: true, phase: "ready", result, requestedPath: [...path], issue: null });
    } catch (error) {
      if (generation !== this.generation) return;

      this.abort = null;

      if (error instanceof Error && error.name === "NotAllowedError") {
        this.close();
        this.onPermissionLost();

        return;
      }

      const missing = error instanceof Error && ["NotFoundError", "TypeMismatchError"].includes(error.name);

      this.publish({ ...this.state, phase: "error", issue: missing ? "missing" : "read" });
    }
  }
  enter = async (name: string) => {
    if (this.state.phase !== "ready"
      || !this.state.result?.entries.some(entry => entry.kind === "directory" && entry.name === name)) return;

    await this.load([...this.state.result.path, name]);
  };
  parent = () => this.state.open ? this.load(this.state.result?.path.slice(0, -1) ?? []) : Promise.resolve();
  root = () => this.state.open ? this.load([]) : Promise.resolve();
  retry = () => this.state.open ? this.load(this.state.requestedPath) : Promise.resolve();
  selectedPath = (): readonly string[] | null => this.state.open && this.state.phase === "ready" && this.state.result ? [...this.state.result.path] : null;
}

import type { FolderSearchResult } from "../services/folder-tree-search";
import type { SourceListingController } from "./source-listing-controller";

export type FolderSearchState = Readonly<{
  phase: "idle" | "loading" | "ready" | "error" | "cancelled";
  result: FolderSearchResult | null;
}>;

const initial: FolderSearchState = { phase: "idle", result: null };
/** 검색 요청은 현재 목록/선택과 독립적이며 연결·경로·검색어 변경에서 취소된다. */
export class FolderSearchController {
  private state = initial;
  private key = "";
  private abort: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();

  constructor(
    private readonly listing: SourceListingController,
    private readonly read: (path: readonly string[], query: string, signal: AbortSignal) => Promise<FolderSearchResult>,
    private readonly permissionLost: () => void,
  ) {
    listing.subscribe(() => this.sync());
  }
  getSnapshot = () => this.state;
  getServerSnapshot = () => initial;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(state: FolderSearchState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  private stop() {
    clearTimeout(this.timer);
    this.abort?.abort();
    this.abort = null;
  }

  private sync() {
    const state = this.listing.getSnapshot();
    const active = state.available && !state.stale && state.phase === "ready" && state.searchOpen && state.query.trim() && state.result;
    const key = active ? JSON.stringify([this.listing.getEpoch(), state.result?.path, state.query]) : "";

    if (key === this.key) {
      return;
    }

    this.key = key;
    this.stop();

    if (!active) {
      this.publish(initial);

      return;
    }

    const abort = new AbortController();
    this.abort = abort;
    this.publish({ phase: "loading", result: null });
    this.timer = setTimeout(() => {
      void this.read(state.result!.path, state.query, abort.signal).then(result => {
        if (!abort.signal.aborted) {
          this.publish({ phase: "ready", result });
        }
      }).catch(error => {
        if (abort.signal.aborted) {
          return;
        }

        this.publish({ phase: "error", result: null });

        if (error instanceof DOMException && error.name === "NotAllowedError") {
          this.permissionLost();
        }
      });
    }, 180);
  }

  cancel = () => {
    this.stop();
    this.publish({ phase: "cancelled", result: null });
  };

  retry = () => {
    this.key = "";
    this.sync();
  };
}

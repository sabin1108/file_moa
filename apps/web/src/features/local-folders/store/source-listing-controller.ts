/**
 * 현재 폴더의 목록·파일 선택·새로고침 상태를 관리한다. SourceFolderBrowser가 구독한다.
 * 연결 controller가 주입한 읽기 함수를 호출하고, 경로/연결 변경과 늦은 응답에 맞춰 목록과 선택을 보존하거나 비운다.
 */
import type { FolderListing } from "../services/source-folder-listing";
import { filterFolderEntries } from "../lib/file-name-search";

export type ListingIssue = "permission" | "missing" | "read" | "cancelled";

export type SourceListingState = Readonly<{
  available: boolean;
  phase: "idle" | "loading" | "ready" | "error" | "cancelled";
  result: FolderListing | null;
  requestedPath: readonly string[];
  stale: boolean;
  issue: ListingIssue | null;
  /** 현재 result.path 안의 항목 이름을 보관한다. 폴더 선택은 재귀 작업 승인이 아니다. */
  selectedNames: readonly string[];
  query: string;
  searchOpen: boolean;
  selectionOpen: boolean;
}>;

export type SourceListingView = Pick<SourceListingState, "query" | "selectedNames" | "searchOpen" | "selectionOpen"> & {
  selectedKinds: Readonly<Record<string, "file" | "directory">>;
};

const initialState: SourceListingState = {
  available: false,
  phase: "idle",
  result: null,
  requestedPath: [],
  stale: false,
  issue: null,
  selectedNames: [],
  query: "",
  searchOpen: false,
  selectionOpen: false,
};
/** 현재 폴더의 탐색·선택 상태를 소유한다. 연결 수명은 connection controller/session이 관리한다. */

export class SourceListingController {
  private state = initialState;
  private generation = 0;
  private epoch = 0;
  private abort: AbortController | null = null;
  private readers = 0;
  private listeners = new Set<() => void>();

  constructor(
    private readonly read: (path: readonly string[], signal: AbortSignal) => Promise<FolderListing>,
    private readonly onPermissionLost: () => void,
  ) { }
  getSnapshot = () => this.state;
  getEpoch = () => this.epoch;
  getServerSnapshot = () => initialState;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(state: SourceListingState) {
    this.state = { ...state, selectionOpen: state.selectionOpen || state.selectedNames.length > 0 };
    this.listeners.forEach(listener => listener());
  }

  private invalidate() {
    ++this.generation;
    this.abort?.abort();
    this.abort = null;
  }

  private ensureLoaded() {
    if (this.readers > 0 && this.state.available && this.state.phase === "idle") {
      void this.open(this.state.result?.path ?? []);
    }
  }

  activate = () => {
    this.readers++;
    this.ensureLoaded();

    return () => {
      this.readers--;
    };
  };

  reset(available: boolean) {
    ++this.epoch;
    this.invalidate();
    this.publish({ ...initialState, available });
    this.ensureLoaded();
  }
  /** A picker may be cancelled: preserve the last view while blocking new reads. */

  suspend() {
    this.invalidate();
    this.publish({
      ...this.state,
      available: false,
      phase: this.state.result ? "ready" : "idle",
      stale: this.state.result !== null,
    });
  }

  resume(available: boolean, refresh = false) {
    this.publish({
      ...this.state,
      available,
      phase: refresh ? "idle" : this.state.phase
    });
    this.ensureLoaded();
  }

  permissionLost() {
    this.invalidate();
    this.publish({
      ...this.state,
      available: false,
      phase: "error",
      issue: "permission",
      stale: this.state.result !== null
    });
  }

  private canSelect() {
    return this.state.available && this.state.phase === "ready" && !this.state.stale;
  }

  setQuery = (query: string) => {
    if (!this.state.result || this.state.phase === "loading" || query === this.state.query) {
      return;
    }

    this.publish({ ...this.state, query });
  };

  setSearchOpen = (searchOpen: boolean) => {
    this.publish({
      ...this.state,
      searchOpen,
      query: searchOpen ? this.state.query : ""
    });
  };
  /** 방문 기록의 표시 상태만 복원한다. 재조회에서 사라진 파일은 재선택하지 않는다. */

  restoreView(view: SourceListingView) {
    const { selectedKinds, ...display } = view;
    const entries = new Map(this.state.result?.entries.map(entry => [entry.name, entry.kind]));

    this.publish({
      ...this.state,
      ...display,
      selectedNames: view.selectedNames.filter(name => entries.has(name) && selectedKinds[name] === entries.get(name))
    });
  }

  private visibleFiles() {
    return filterFolderEntries(this.state.result?.entries ?? [], this.state.query).filter(entry => entry.kind === "file");
  }

  toggleSelection = (name: string) => {
    if (!this.canSelect()
      || !filterFolderEntries(this.state.result?.entries ?? [], this.state.query).some(entry => entry.name === name)) {
      return;
    }

    const selectedNames = this.state.selectedNames.includes(name)
      ? this.state.selectedNames.filter(selected => selected !== name)
      : [...this.state.selectedNames, name];

    this.publish({ ...this.state, selectedNames, selectionOpen: selectedNames.length > 0 });
  };

  selectAll = () => {
    if (!this.canSelect()) {
      return;
    }

    const selectedNames = [...new Set([...this.state.selectedNames, ...this.visibleFiles().map(entry => entry.name)])];

    this.publish({ ...this.state, selectedNames });
  };

  clearVisibleSelection = () => {
    if (!this.canSelect()) {
      return;
    }

    const visible = new Set(this.visibleFiles().map(entry => entry.name));

    this.publish({ ...this.state, selectedNames: this.state.selectedNames.filter(name => !visible.has(name)) });
  };

  clearSelection = () => {
    if (this.state.selectedNames.length) {
      this.publish({ ...this.state, selectedNames: [] });
    }
  };

  exitSelection = () => this.publish({ ...this.state, selectedNames: [], selectionOpen: false });

  open = async (path: readonly string[]): Promise<void> => {
    if (!this.state.available) {
      return;
    }

    this.invalidate();

    const generation = this.generation;
    const abort = new AbortController();

    this.abort = abort;

    const requestedPath = [...path];
    const samePath = JSON.stringify(requestedPath) === JSON.stringify(this.state.result?.path ?? []);

    this.publish({
      ...this.state,
      phase: "loading",
      requestedPath,
      issue: null,
      stale: this.state.result !== null,
      selectedNames: samePath ? this.state.selectedNames : [],
      query: samePath ? this.state.query : "",
      searchOpen: samePath && this.state.searchOpen,
      selectionOpen: samePath && this.state.selectionOpen,
    });

    try {
      const result = await this.read(requestedPath, abort.signal);

      if (generation !== this.generation) {
        return;
      }

      this.abort = null;
      // 성공한 표시 결과 안의 항목만 유지한다. 상한 밖 항목은 원본 삭제로 판정하지 않는다.

      const previousKinds = new Map(this.state.result?.entries.map(entry => [entry.name, entry.kind]));
      const entries = new Map(result.entries.map(entry => [entry.name, entry.kind]));
      const selectedNames = this.state.selectedNames.filter(name => entries.has(name) && previousKinds.get(name) === entries.get(name));

      this.publish({
        ...this.state,
        available: true,
        phase: "ready",
        result,
        requestedPath,
        stale: false,
        issue: null,
        selectedNames,
        selectionOpen: this.state.selectedNames.length > 0 && selectedNames.length === 0 ? false : this.state.selectionOpen
      });
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }

      this.abort = null;

      const name = error instanceof Error ? error.name : "";
      let issue: ListingIssue = "read";

      if (name === "NotAllowedError") {
        issue = "permission";
      } else if (name === "NotFoundError" || name === "TypeMismatchError") {
        issue = "missing";
      } else if (name === "AbortError") {
        issue = "cancelled";
      }

      this.publish({
        ...this.state,
        available: issue !== "permission",
        phase: issue === "cancelled" ? "cancelled" : "error",
        issue,
      });

      if (issue === "permission") {
        this.onPermissionLost();
      }
    }
  };
  refresh = () => this.open(this.state.result?.path ?? []);
  retry = () => this.open(this.state.requestedPath);

  cancel = () => {
    if (this.state.phase !== "loading") {
      return;
    }

    this.invalidate();
    this.publish({
      ...this.state,
      phase: "cancelled",
      issue: "cancelled"
    });
  };
}

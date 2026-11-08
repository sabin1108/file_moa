import type { SourceListingController, SourceListingView } from "./source-listing-controller";
import type { SourcePreviewController } from "./source-preview-controller";

export type ViewportPosition = Readonly<{
  scrollY: number;
  focusLabel: string | null;
}>;

export type NavigationPort = {
  read(): string | null;
  write(id: string, replace: boolean): void;
  back(): void;
  active(): boolean;
  capture(): ViewportPosition;
  restore(position: ViewportPosition): void;
};

type Visit = {
  folder: readonly string[];
  file: readonly string[] | null;
  view: SourceListingView;
  viewport: ViewportPosition;
  parent: string | null;
};

const samePath = (a: readonly string[], b: readonly string[]) => JSON.stringify(a) === JSON.stringify(b);
/** Provider 수명의 탐색 기록. 파일 정보는 메모리에만 두며 browser port에는 불투명 ID만 전달한다. */
export class SourceNavigationController {
  private visits = new Map<string, Visit>();
  private current: string | null = null;
  private port: NavigationPort | null = null;
  private epoch: number;
  private generation = 0;

  constructor(
    private readonly listing: SourceListingController,
    private readonly preview: SourcePreviewController,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {
    this.epoch = listing.getEpoch();
    // 같은 소유자의 controller들과 함께 생성/폐기된다. 연결 reset은 이름이 같아도 새 수명이다.
    listing.subscribe(() => {
      if (this.epoch === listing.getEpoch()) {
        return;
      }

      this.epoch = listing.getEpoch();
      ++this.generation;
      this.visits.clear();
      this.current = null;
    });
  }

  private capture(parent: string | null): Visit {
    const state = this.listing.getSnapshot();

    return {
      folder: [...(state.phase === "loading" || state.issue ? state.requestedPath : state.result?.path ?? [])],
      file: this.preview.getSnapshot().path,
      view: {
        query: state.query, selectedNames: [...state.selectedNames], searchOpen: state.searchOpen, selectionOpen: state.selectionOpen,
        selectedKinds: Object.fromEntries((state.result?.entries ?? []).filter(entry => state.selectedNames.includes(entry.name)).map(entry => [entry.name, entry.kind]))
      },
      viewport: this.port?.capture() ?? { scrollY: 0, focusLabel: null }, parent,
    };
  }

  private save() {
    const old = this.current && this.visits.get(this.current);

    if (old && this.current) {
      this.visits.set(this.current, this.capture(old.parent));
    }
  }

  private record(visit: Visit, replace: boolean) {
    const id = this.createId();
    this.visits.set(id, visit);
    this.current = id;

    if (this.visits.size > 200) {
      this.visits.delete(this.visits.keys().next().value!);
    }

    this.port?.write(id, replace);
  }

  attach(port: NavigationPort) {
    this.port = port;

    return this.pop(false);
  }

  detach() {
    this.save();
    this.port = null;
    ++this.generation;
  }
  /** popstate와 화면 재진입을 처리한다. 비동기 복원은 최신 이동과 연결에서만 완료할 수 있다. */

  async pop(save = true) {
    const port = this.port;

    if (!port?.active()) {
      return;
    }

    if (save) {
      this.save();
    }

    const id = port.read();
    const visit = id && this.visits.get(id);
    const generation = ++this.generation;

    if (!visit) {
      this.record(this.capture(null), true);

      return;
    }

    this.current = id;
    this.preview.close();

    if (!this.listing.getSnapshot().available) {
      return;
    }

    const state = this.listing.getSnapshot();

    if (state.phase === "loading" || !state.result || !samePath(state.result.path, visit.folder)) {
      await this.listing.open(visit.folder);
    }

    if (generation !== this.generation || !port.active()) {
      return;
    }

    const next = this.listing.getSnapshot();

    if (next.result && samePath(next.result.path, visit.folder)) {
      this.listing.restoreView(visit.view);
    }

    if (visit.file && next.available && next.phase === "ready" && next.result && samePath(next.result.path, visit.folder)) {
      await this.preview.open(visit.file);
    }

    if (generation === this.generation && port.active()) {
      port.restore(visit.viewport);
    }
  }

  private prepare() {
    if (!this.port?.active() || !this.listing.getSnapshot().available) {
      return false;
    }

    ++this.generation;

    if (!this.current) {
      this.record(this.capture(null), true);
    }

    this.save();

    return true;
  }

  openFolder = async (path: readonly string[], refresh = false) => {
    if (!this.prepare()) {
      return;
    }

    const visit = this.capture(this.current);

    if (samePath(visit.folder, path) && !visit.file) {
      if (refresh) {
        await this.listing.open(path);
      }

      return;
    }

    this.preview.close();
    this.record({
      ...visit, folder: [...path], file: null, view: {
        query: "", selectedNames: [], selectedKinds: {}, searchOpen: false, selectionOpen: false
      }, viewport: { scrollY: 0, focusLabel: null }
    }, false);
    await this.listing.open(path);
  };
  /** 이전 열의 목록은 캐시다. 현재 연결에서 다시 읽은 이름/종류만 선택한다. */

  selectFromPrevious = async (path: readonly string[], name: string, kind: "file" | "directory") => {
    const pending = this.openFolder(path, true);
    const generation = this.generation;
    await pending;

    if (generation !== this.generation || !this.port?.active()) {
      return;
    }

    const state = this.listing.getSnapshot();

    if (!state.available || state.stale || state.phase !== "ready" || !state.result || !samePath(state.result.path, path)) {
      return;
    }

    if (!state.result.entries.some(entry => entry.name === name && entry.kind === kind)) {
      return;
    }

    this.listing.setQuery("");

    if (!state.selectedNames.includes(name)) {
      this.listing.toggleSelection(name);
    }
  };

  openFile = async (path: readonly string[]) => {
    if (!this.prepare()) {
      return;
    }

    const visit = this.capture(this.current);

    if (visit.file && samePath(visit.file, path)) {
      return;
    }

    this.record({
      ...visit, file: [...path], viewport: { scrollY: 0, focusLabel: null }
    }, false);
    await this.preview.open(path);
  };

  closeFile = () => {
    const visit = this.current && this.visits.get(this.current);
    const parent = visit && visit.parent && this.visits.get(visit.parent);

    if (this.port?.active() && parent && !parent.file) {
      this.port.back();
    } else {
      this.preview.close();

      if (this.port?.active()) {
        this.record(this.capture(null), true);
      }
    }
  };
}

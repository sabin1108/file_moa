import type { SampleCatalog } from "../../../shared/sample-contract";
import type { FolderListing } from "../../local-folders/browsing/source-folder-listing";
import type { EntryKind } from "../../local-folders/creation/new-entry";
import { ManagedFilesController } from "../../local-folders/operations/managed/managed-files-controller";
import type { ManagedPreview, ManagedRequest, ManagedResult } from "../../local-folders/operations/managed/managed-files";
import { sampleActiveCatalog, type SampleState } from "../sample-state";
import type { SampleWorkspaceStore } from "../sample-workspace-store";
import { createSampleFiles, createSampleEntry, prepareSampleFileOperation, sampleFileView, type SampleFiles } from "./sample-file-workspace";

/** 공통 파일 작업 controller의 I/O만 탭의 예시 자료로 바꾼다. 실제 핸들·서버 호출은 없다. */
export class SampleFileController {
  readonly managed: ManagedFilesController;
  private seed: { signature: string; files: SampleFiles } | null = null;
  private prepared: { before: string; next: SampleFiles; preview: ManagedPreview } | null = null;
  private editor: { id: string; before: string } | null = null;

  constructor(private readonly catalog: SampleCatalog, private readonly store: SampleWorkspaceStore) {
    this.managed = new ManagedFilesController(this.read, async (path, signal) => {
      this.check(signal);
      const node = this.files().nodes.find(node => JSON.stringify(node.path) === JSON.stringify(path));
      if (!node || node.kind !== "file" || !/\.(md|txt)$/i.test(node.path.at(-1)!)) throw Error("managed-encoding");
      this.editor = { id: node.id, before: JSON.stringify(node) };
      return { id: node.id, path: [...node.path], text: node.text! };
    }, this.prepare, async (preview, signal): Promise<ManagedResult> => {
      this.check(signal);
      const prepared = this.prepared;
      if (!prepared || preview.id !== prepared.preview.id || prepared.before !== JSON.stringify(this.files())) throw Error("managed-changed");
      this.commit(prepared.next);
      this.prepared = null;
      return { id: preview.id, phase: "completed", status: "verified", copied: preview.kind === "trash" ? 0 : preview.files,
        removed: preview.kind === "move" || preview.kind === "trash" ? preview.files : 0,
        preserved: ["move", "trash", "edit"].includes(preview.kind), issue: null };
    }, async signal => {
      this.check(signal);
      return { items: this.files().archives.map(archive => ({ ...archive, completed: true, preserved: true })), truncated: false, unreadable: 0 };
    }, () => { this.prepared = null; });
  }

  files = (): SampleFiles => {
    const state = this.store.getSnapshot().state;
    if (state.files) return state.files;
    const signature = JSON.stringify([state.locations, state.createdFolders]);
    if (this.seed?.signature !== signature) {
      const files = createSampleFiles(sampleActiveCatalog(this.catalog, state), state.locations);
      files.selected = files.nodes.filter(node => state.fileSelected.includes(node.id)
        || state.fileSelectedFolders.some(path => JSON.stringify(path) === JSON.stringify(node.path))).map(node => node.id);
      this.seed = { signature, files };
    }
    return this.seed.files;
  };

  private check(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const snapshot = this.store.getSnapshot();
    if (!snapshot.ready || snapshot.expired || snapshot.aiPending || snapshot.state.phase === "review") throw Error("managed-changed");
  }

  private commit(files: SampleFiles) {
    this.check();
    if (!this.store.dispatch({ type: "file-workspace", files })) throw Error("managed-changed");
  }

  select = (ids: readonly string[]) => this.commit({ ...this.files(), selected: [...ids] });
  toggle = (id: string) => {
    const selected = this.files().selected;
    this.select(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  };
  create = async (path: readonly string[], name: string, kind: EntryKind) => {
    this.check();
    const next = createSampleEntry(this.files(), path, name, kind);
    this.commit(next);
    return next.nodes.at(-1)!.path;
  };

  read = async (path: readonly string[], signal: AbortSignal): Promise<FolderListing> => {
    this.check(signal);
    const files = this.files();
    if (path.length && !files.nodes.some(node => node.kind === "directory" && JSON.stringify(node.path) === JSON.stringify(path))) throw Error("managed-missing");
    return { path: [...path], truncated: false, entries: files.nodes.filter(node => node.path.length === path.length + 1
      && path.every((part, index) => node.path[index] === part)).map(node => ({ name: node.path.at(-1)!, kind: node.kind })) };
  };

  private prepare = async (request: ManagedRequest, signal: AbortSignal) => {
    this.check(signal);
    const files = this.files();
    if (request.kind === "edit" && (!this.editor || request.editId !== this.editor.id
      || this.editor.before !== JSON.stringify(files.nodes.find(node => node.id === request.editId)))) throw Error("managed-changed");
    const result = prepareSampleFileOperation(files, request);
    this.prepared = { before: JSON.stringify(files), ...result };
    return result.preview;
  };

  view = (): { catalog: SampleCatalog; locations: SampleState["locations"] } => {
    return sampleFileView(this.catalog, this.files());
  };
}

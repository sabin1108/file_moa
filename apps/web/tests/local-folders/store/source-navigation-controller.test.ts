import { describe, expect, it, vi } from "vitest";
import { SourceListingController } from "../../../src/features/local-folders/store/source-listing-controller";
import { SourcePreviewController } from "../../../src/features/local-folders/store/source-preview-controller";
import { SourceNavigationController, type NavigationPort } from "../../../src/features/local-folders/store/source-navigation-controller";
import type { FolderListing } from "../../../src/features/local-folders/services/source-folder-listing";

async function setup() {
  const read = vi.fn(async (path: readonly string[]): Promise<FolderListing> => ({ path, entries: [{ name: "a.md", kind: "file" }], truncated: false }));
  const body = vi.fn(async (path: readonly string[]) => ({ path, text: "private body", size: 12, lastModified: 0 }));
  const listing = new SourceListingController(read, vi.fn());
  const preview = new SourcePreviewController(body, vi.fn());
  listing.reset(true); preview.reset(true); await listing.open([]);
  let current: string | null = null;
  let active = true;
  const port: NavigationPort = {
    read: () => current, write: vi.fn((id: string) => { current = id; }), back: vi.fn(),
    active: () => active, capture: () => ({ scrollY: 123, focusLabel: "a.md 미리보기" }), restore: vi.fn(),
  };
  let id = 0;
  const nav = new SourceNavigationController(listing, preview, () => `opaque-${++id}`);
  nav.attach(port);
  const pop = async (value: string | null) => { current = value; await nav.pop(); };
  return { nav, listing, preview, read, body, port, pop, id: () => current!, leave: () => { active = false; } };
}

describe("browser navigation lifetime", () => {
  it("SELECT-025 refreshes a same-path cached or pending listing before selecting", async () => {
    const s = await setup(); let finish!: (value: FolderListing) => void;
    s.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = s.listing.refresh();
    await s.nav.selectFromPrevious([], "a.md", "file");
    finish({ path: [], entries: [], truncated: false }); await old;
    expect(s.listing.getSnapshot()).toMatchObject({ selectedNames: ["a.md"], selectionOpen: true });
    s.read.mockResolvedValueOnce({ path: [], entries: [], truncated: false });
    await s.nav.selectFromPrevious([], "a.md", "file");
    expect(s.listing.getSnapshot()).toMatchObject({ selectedNames: [], selectionOpen: false });
  });
  it("SELECT-025 rechecks a previous item before selecting and rejects changed kinds", async () => {
    const s = await setup();
    await s.nav.openFolder(["child"]);
    await s.nav.selectFromPrevious([], "a.md", "file");
    expect(s.listing.getSnapshot()).toMatchObject({ selectionOpen: true, selectedNames: ["a.md"], result: { path: [] } });
    await s.nav.openFolder(["child"]);
    s.read.mockResolvedValueOnce({ path: [], entries: [{ name: "a.md", kind: "directory" }], truncated: false });
    await s.nav.selectFromPrevious([], "a.md", "file");
    expect(s.listing.getSnapshot().selectedNames).toEqual([]);
  });
  it("SELECT-025 a newer navigation invalidates a pending long-press selection", async () => {
    const s = await setup(); await s.nav.openFolder(["child"]);
    let finish!: (value: FolderListing) => void;
    s.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.nav.selectFromPrevious([], "a.md", "file");
    await s.nav.openFolder(["other"]);
    finish({ path: [], entries: [{ name: "a.md", kind: "file" }], truncated: false }); await pending;
    expect(s.listing.getSnapshot()).toMatchObject({ selectedNames: [], result: { path: ["other"] } });
  });
  it.each(["file", "directory"] as const)("does not restore a selected %s after its kind changes while away", async kind => {
    const s = await setup(); const root = s.id();
    s.read.mockResolvedValueOnce({ path: [], entries: [{ name: "a.md", kind }], truncated: false });
    await s.listing.refresh(); s.listing.toggleSelection("a.md");
    await s.nav.openFolder(["child"]);
    s.read.mockResolvedValueOnce({ path: [], entries: [{ name: "a.md", kind: kind === "file" ? "directory" : "file" }], truncated: false });
    await s.pop(root); expect(s.listing.getSnapshot().selectedNames).toEqual([]);
  });
  it("NAV-001/002 back and forward restore preview plus list search, selection and viewport", async () => {
    const s = await setup(); const root = s.id();
    s.listing.setSearchOpen(true); s.listing.setQuery("a"); s.listing.selectAll();
    await s.nav.openFile(["a.md"]); const file = s.id();
    expect(file).not.toBe(root);
    await s.pop(root);
    expect(s.preview.getSnapshot().path).toBeNull();
    expect(s.listing.getSnapshot()).toMatchObject({ query: "a", selectedNames: ["a.md"], searchOpen: true, selectionOpen: true });
    expect(s.port.restore).toHaveBeenCalledWith({ scrollY: 123, focusLabel: "a.md 미리보기" });
    await s.pop(file); expect(s.preview.getSnapshot().path).toEqual(["a.md"]);
    s.nav.closeFile(); expect(s.port.back).toHaveBeenCalledOnce();
  });
  it("NAV-001/002 folder traversal restores scoped state and filters missing selections", async () => {
    const s = await setup(); const root = s.id(); s.listing.selectAll();
    await s.nav.openFolder(["child"]); const child = s.id();
    expect(s.listing.getSnapshot().result?.path).toEqual(["child"]);
    s.read.mockResolvedValueOnce({ path: [], entries: [], truncated: false });
    await s.pop(root); expect(s.listing.getSnapshot().selectedNames).toEqual([]);
    await s.pop(child); expect(s.listing.getSnapshot().result?.path).toEqual(["child"]);
  });
  it("NAV-002 pending file read cannot reopen preview after back", async () => {
    const s = await setup(); const root = s.id();
    let finish!: (value: { path: string[]; text: string; size: number; lastModified: number }) => void;
    s.body.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.nav.openFile(["a.md"]);
    await s.pop(root);
    finish({ path: ["a.md"], text: "late", size: 4, lastModified: 0 }); await pending;
    expect(s.preview.getSnapshot().path).toBeNull();
  });
  it("NAV-002 rapid back during a folder read ignores its late result", async () => {
    const s = await setup(); const root = s.id(); let finish!: (value: FolderListing) => void;
    s.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.nav.openFolder(["slow"]); await s.pop(root);
    finish({ path: ["slow"], entries: [], truncated: false }); await pending;
    expect(s.listing.getSnapshot().result?.path).toEqual([]);
  });
  it("NAV-003 reset invalidates old records even for the same folder name", async () => {
    const s = await setup(); await s.nav.openFile(["a.md"]); const old = s.id();
    s.listing.reset(true); s.preview.reset(true); await s.listing.open([]);
    const reads = s.body.mock.calls.length; await s.pop(old);
    expect(s.body).toHaveBeenCalledTimes(reads); expect(s.preview.getSnapshot().path).toBeNull();
  });
  it("NAV-003 permission loss does not force a forward read or request access", async () => {
    const s = await setup(); const root = s.id(); await s.nav.openFile(["a.md"]); const file = s.id();
    await s.pop(root); s.listing.permissionLost(); s.preview.permissionLost();
    const reads = s.body.mock.calls.length; await s.pop(file);
    expect(s.body).toHaveBeenCalledTimes(reads); expect(s.preview.getSnapshot().path).toBeNull();
  });
  it("NAV-003 port receives opaque IDs only, never paths or body", async () => {
    const s = await setup(); await s.nav.openFile(["a.md"]);
    const args = JSON.stringify(vi.mocked(s.port.write).mock.calls);
    expect(args).not.toContain("a.md"); expect(args).not.toContain("private body");
    await s.pop("expired"); expect(s.id()).not.toBe("expired");
  });
  it("NAV-004 detach/reattach preserves valid history and does not handle other routes", async () => {
    const s = await setup(); const root = s.id(); await s.nav.openFile(["a.md"]);
    s.nav.detach(); await s.pop(root); expect(s.preview.getSnapshot().path).toEqual(["a.md"]);
    await s.nav.attach(s.port); expect(s.preview.getSnapshot().path).toBeNull();
    s.leave(); await s.nav.openFile(["a.md"]); expect(s.preview.getSnapshot().path).toBeNull();
  });
  it("SELECT-024 closing search preserves selected items and their controls", async () => {
    const s = await setup(); s.listing.setSearchOpen(true); s.listing.setQuery("a"); s.listing.selectAll();
    s.listing.setSearchOpen(false);
    expect(s.listing.getSnapshot()).toMatchObject({ query: "", searchOpen: false, selectionOpen: true, selectedNames: ["a.md"] });
  });
});

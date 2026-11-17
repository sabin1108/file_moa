import { describe, expect, it, vi } from "vitest";
import { SourceListingController } from "../../../src/features/local-folders/browsing/file-list/source-listing-controller";
import { SourcePlanController } from "../../../src/features/local-folders/operations/planning/source-plan-controller";
import type { FolderListing } from "../../../src/features/local-folders/browsing/source-folder-listing";

async function setup() {
  const read = vi.fn(async (path: readonly string[], signal: AbortSignal): Promise<FolderListing> => {
    signal.throwIfAborted();

    return {
      path,
      truncated: false,
      entries: path.length ? [] : [{ name: "보관 자료", kind: "directory" }, { name: "a.md", kind: "file" }],
    };
  });
  const listing = new SourceListingController(read, vi.fn());

  listing.reset(true);
  await listing.open([]);
  listing.selectAll();

  const permission = vi.fn();
  const plan = new SourcePlanController(listing, read, permission);

  plan.open();

  return { plan, picker: plan.destinationPicker, listing, read, permission };
}

describe("plan destination folder picker", () => {
  it("recovers from a missing proposed folder to its actual parent, even with a previous listing", async () => {
    for (const previous of [false, true]) {
      const { picker, read } = await setup();

      if (previous) await picker.show(["다른 위치"]);
      read.mockRejectedValueOnce(new DOMException("missing", "NotFoundError"));
      await picker.show(["자료", "영어"]);
      expect(picker.selectedPath()).toBeNull();
      await picker.parent();
      expect(picker.selectedPath()).toEqual(["자료"]);
      expect(read.mock.calls.at(-1)?.[0]).toEqual(["자료"]);
      await picker.root();
      expect(picker.selectedPath()).toEqual([]);
    }
  });
  it("NAV-019 keeps the picker and last listing open during direct/ancestor navigation, including failure", async () => {
    const { plan, picker, read } = await setup();

    await plan.browseDestination();

    const previous = picker.getSnapshot().result;
    const states: ReturnType<typeof picker.getSnapshot>[] = [];

    picker.subscribe(() => states.push(picker.getSnapshot()));

    let reject!: (error: Error) => void;

    read.mockImplementationOnce(() => new Promise((_, fail) => {
      reject = fail;
    }));

    const pending = picker.show(["missing"]);

    expect(states.every(state => state.open && state.result === previous)).toBe(true);
    expect(picker.selectedPath()).toBeNull();
    reject(new DOMException("missing", "NotFoundError"));
    await pending;
    expect(picker.getSnapshot()).toMatchObject({ open: true, phase: "error", result: previous, requestedPath: ["missing"] });
    await picker.retry();
    expect(picker.selectedPath()).toEqual(["missing"]);
  });
  it("NAV-019 a newer direct navigation aborts and discards an older response without closing", async () => {
    const { plan, picker, read } = await setup();

    await plan.browseDestination();

    let finish!: (value: FolderListing) => void;

    read.mockImplementationOnce(() => new Promise(resolve => {
      finish = resolve;
    }));

    const older = picker.show(["old"]);
    const signal = read.mock.calls.at(-1)![1];

    await picker.show(["new"]);
    expect(signal.aborted).toBe(true);
    finish({ path: ["old"], entries: [], truncated: false });
    await older;
    expect(picker.selectedPath()).toEqual(["new"]);
  });
  it("DEST-001/002 browses actual directories and applies exact relative path without changing source selection", async () => {
    const { plan, picker, listing, read } = await setup();

    await plan.browseDestination();
    await picker.enter("a.md");
    expect(read).toHaveBeenCalledTimes(2);
    await picker.enter("보관 자료");
    plan.chooseDestination();
    expect(plan.getSnapshot()).toMatchObject({ destination: "보관 자료", phase: "draft", result: null });
    expect(picker.getSnapshot().open).toBe(false);
    expect(listing.getSnapshot().result?.path).toEqual([]);
    expect(listing.getSnapshot().selectedNames).toEqual(["a.md"]);
  });
  it("DEST-001/002 starts from typed path, supports parent and selects root as empty string", async () => {
    const { plan, picker } = await setup();

    plan.setDestination("보관 자료/하위");
    await plan.browseDestination();
    expect(picker.getSnapshot().result?.path).toEqual(["보관 자료", "하위"]);
    await picker.parent();
    expect(picker.getSnapshot().result?.path).toEqual(["보관 자료"]);
    await picker.root();
    plan.chooseDestination();
    expect(plan.getSnapshot().destination).toBe("");
  });
  it("DEST-001/003 invalid draft starts at root; cancel retains exact original input", async () => {
    const { plan, picker } = await setup();

    plan.setDestination("../bad");
    await plan.browseDestination();
    expect(picker.getSnapshot().result?.path).toEqual([]);
    picker.close();
    expect(plan.getSnapshot().destination).toBe("../bad");
  });
  it("DEST-003/004 blocks selection and generation while pending and after failure; retry can choose empty folder", async () => {
    const { plan, picker, read } = await setup();

    plan.setDestination("보관 자료");
    read.mockRejectedValueOnce(new DOMException("missing", "NotFoundError"));
    await plan.browseDestination();
    plan.chooseDestination();
    expect(picker.getSnapshot().open).toBe(true);

    const count = read.mock.calls.length;

    await plan.generate();
    expect(read).toHaveBeenCalledTimes(count);
    await picker.retry();
    plan.chooseDestination();
    expect(plan.getSnapshot().destination).toBe("보관 자료");
  });
  it("DEST-004 a partial child listing stays explicit but the confirmed directory can be chosen", async () => {
    const { plan, picker, read } = await setup();

    read.mockResolvedValueOnce({ path: [], entries: [], truncated: true });
    await plan.browseDestination();
    expect(picker.getSnapshot().result?.truncated).toBe(true);
    plan.chooseDestination();
    expect(picker.getSnapshot().open).toBe(false);
  });
  it("DEST-005 close, selection change and direct edits abort reads and discard late completion", async () => {
    for (const action of ["close", "selection", "edit"] as const) {
      const { plan, picker, read, listing } = await setup();
      let finish!: (value: FolderListing) => void;

      read.mockImplementationOnce(() => new Promise(resolve => {
        finish = resolve;
      }));

      const pending = plan.browseDestination();
      const signal = read.mock.calls.at(-1)![1];

      plan.chooseDestination();
      expect(picker.getSnapshot().open).toBe(true);

      if (action === "close") plan.close(); else if (action === "selection") listing.clearSelection(); else plan.setDestination("직접 입력");

      expect(signal.aborted).toBe(true);
      finish({ path: [], entries: [], truncated: false });
      await pending;
      expect(picker.getSnapshot()).toMatchObject({ open: false, result: null });

      if (action === "edit") expect(plan.getSnapshot().destination).toBe("직접 입력");
    }
  });
  it("DEST-005 permission loss closes both picker and plan through the common permission boundary", async () => {
    const { plan, picker, read, permission } = await setup();

    read.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await plan.browseDestination();
    expect(plan.getSnapshot().open).toBe(false);
    expect(picker.getSnapshot().open).toBe(false);
    expect(permission).toHaveBeenCalledOnce();
  });
  it("DEST-002 selecting a destination discards previous result; generation revalidates it", async () => {
    const { plan, read } = await setup();

    plan.setDestination("");
    await plan.generate();
    expect(plan.getSnapshot().result).not.toBeNull();
    await plan.browseDestination();
    plan.chooseDestination();
    expect(plan.getSnapshot().result).toBeNull();

    const before = read.mock.calls.length;

    await plan.generate();
    expect(read).toHaveBeenCalledTimes(before + 2);
  });
});

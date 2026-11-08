import { describe, expect, it, vi } from "vitest";
import { prepareFoundDocuments } from "../../src/features/conversation-workspace/lib/request-routing";
import { DocumentFindController } from "../../src/features/local-folders/store/document-find-controller";
import { OrganizationPreparationController } from "../../src/features/local-folders/store/organization-preparation-controller";
import type { SourceSnapshot } from "../../src/features/local-folders/lib/source-snapshot";

const path = ["archive", "meeting.md"];
const found = { name: "meeting.md", path, finding: { kind: "matched" as const, dates: [], evidence: ["회의 기록"] } };
async function setup() {
  const finding = new DocumentFindController(vi.fn(async () => ({ documents: [found], complete: true, excluded: [], limits: [], discoveredFiles: 1 })));
  finding.start("회의 자료 찾아줘"); await finding.search();
  const snapshot: SourceSnapshot = {
    documents: [{ id: "document-1", name: "meeting.md", path, excerpt: "새로 읽은 회의 기록", sha256: "a".repeat(64), excerptHash: "b".repeat(64), size: 60, lastModified: 1 }],
    complete: true, excluded: [], limits: [], discoveredFiles: 1, directories: 1, bytes: 60,
  };
  const read = vi.fn(async () => snapshot);
  const organization = new OrganizationPreparationController(read, vi.fn());
  const preview = { close: vi.fn() };
  return { finding, organization, preview, read };
}
describe("FIND-007: selected results use existing fresh preparation", () => {
  it("ignores paths absent from the latest results and requires an explicit selection", async () => {
    const actions = await setup();
    actions.finding.toggle(["other.md"]);
    expect(actions.finding.getSnapshot().selectedPaths).toEqual([]);
    expect(prepareFoundDocuments(actions, true)).toBe(false);
    expect(actions.read).not.toHaveBeenCalled();
  });
  it("reads only selected paths again and never grants transfer consent", async () => {
    const actions = await setup();
    actions.organization.update({ basis: "old", reference: ["old"], destination: ["old"] });
    actions.finding.toggle(path);
    expect(prepareFoundDocuments(actions, true)).toBe(true);
    await vi.waitFor(() => expect(actions.organization.getSnapshot().phase).toBe("ready"));
    expect(actions.read).toHaveBeenCalledWith({ kind: "selected", entries: [{ kind: "file", path }] }, expect.stringContaining("회의 자료 정리"), expect.any(AbortSignal));
    expect(actions.finding.getSnapshot()).toMatchObject({ phase: "idle", selectedPaths: [] });
    expect(actions.organization.getSnapshot()).toMatchObject({ request: "회의 자료 정리", basis: "", reference: null, destination: null, consentKey: null, result: null });
    expect(actions.organization.getSnapshot().snapshot?.documents[0].excerpt).toBe("새로 읽은 회의 기록");
  });
  it.each(["configure", "cancel", "reset", "start"] as const)("clears selection on %s and does not prepare stale results", async operation => {
    const actions = await setup(); actions.finding.toggle(path);
    if (operation === "configure") actions.finding.configure({ terms: "new" });
    else if (operation === "start") actions.finding.start("다른 자료 찾아줘");
    else actions.finding[operation]();
    expect(actions.finding.getSnapshot().selectedPaths).toEqual([]);
    expect(prepareFoundDocuments(actions, true)).toBe(false);
    expect(actions.read).not.toHaveBeenCalled();
  });
  it("blocks during an active file operation and allows deselection", async () => {
    const actions = await setup(); actions.finding.toggle(path);
    expect(prepareFoundDocuments(actions, false)).toBe(false);
    actions.finding.toggle(path); expect(actions.finding.getSnapshot().selectedPaths).toEqual([]);
    expect(actions.read).not.toHaveBeenCalled();
  });
});

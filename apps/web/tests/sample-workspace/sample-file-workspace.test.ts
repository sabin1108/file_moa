import { describe, expect, it } from "vitest";
import type { SampleCatalog } from "../../src/shared/sample-contract";
import { createSampleFiles, createSampleEntry, parseSampleFiles, prepareSampleFileOperation } from "../../src/features/sample-workspace/files/sample-file-workspace";

const catalog: SampleCatalog = { version: "1", folders: [{ id: "work", label: "업무" }], documents: [
  { id: "note", name: "회의.md", format: "md", excerpt: "원문", proposal: { folderId: "work", reason: "업무", reviewRequired: false } },
] };
const base = () => createSampleFiles(catalog, { note: null });
const operation = (kind: "copy" | "move" | "trash" | "edit", names = ["회의.md"], destination = ["정리한 자료", "업무"]) => ({ kind, source: ["받은 자료"], names, destination });

describe("DFile: 탭 안의 예시 파일 작업", () => {
  it("공개 원문을 바꾸지 않고 파일과 빈 폴더를 만든다", () => {
    let state = createSampleEntry(base(), ["받은 자료"], "새 폴더", "folder");
    state = createSampleEntry(state, ["받은 자료", "새 폴더"], "초안", "md");
    expect(state.nodes.find(node => node.path.at(-1) === "초안.md")?.text).toBe("");
    expect(catalog.documents[0].excerpt).toBe("원문");
    expect(parseSampleFiles(catalog, JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
  it("복사는 원본과 하위 빈 폴더를 유지하고 이동은 원본을 보존한다", () => {
    let state = createSampleEntry(base(), ["받은 자료"], "빈 폴더", "folder");
    const copy = prepareSampleFileOperation(state, operation("copy", ["회의.md", "빈 폴더"]));
    expect(copy.next.nodes.filter(node => node.path.at(-1) === "회의.md")).toHaveLength(2);
    expect(copy.next.nodes.some(node => node.path.join("/") === "정리한 자료/업무/빈 폴더")).toBe(true);
    state = prepareSampleFileOperation(base(), operation("move")).next;
    expect(state.nodes.some(node => node.path.join("/") === "받은 자료/회의.md")).toBe(false);
    expect(state.archives[0].nodes[0].text).toBe("원문");
    expect(parseSampleFiles(catalog, state)).toEqual(state);
  });
  it("편집 전 내용을 보관하고 휴지통에서 새 위치로 복구한다", () => {
    let state = prepareSampleFileOperation(base(), { ...operation("edit"), text: "새 내용" }).next;
    expect(state.nodes.find(node => node.id === "note")?.text).toBe("새 내용");
    expect(state.archives[0].nodes[0].text).toBe("원문");
    state = prepareSampleFileOperation(state, operation("trash")).next;
    const archive = state.archives.at(-1)!;
    const recovered = prepareSampleFileOperation(state, { kind: "recover", source: [], names: [], destination: ["정리한 자료", "업무"], archiveId: archive.id }).next;
    expect(recovered.nodes.find(node => node.path.at(-1) === "회의.md")?.text).toBe("새 내용");
    expect(recovered.archives).toHaveLength(2);
    expect(parseSampleFiles(catalog, recovered)).toEqual(recovered);
  });
  it("폴더 이동에는 하위 파일을 포함하며 입력을 수정하지 않는다", () => {
    const initial = createSampleEntry(base(), ["받은 자료"], "하위", "folder");
    const state = createSampleEntry(initial, ["받은 자료", "하위"], "메모", "txt");
    const serialized = JSON.stringify(state);
    const moved = prepareSampleFileOperation(state, operation("move", ["하위"]));
    expect(JSON.stringify(state)).toBe(serialized);
    expect(moved.next.nodes.some(node => node.path.join("/") === "정리한 자료/업무/하위/메모.txt")).toBe(true);
  });
  it("동일 이름·자기 하위·잘못된 경로·없는 선택·중복 선택을 거부한다", () => {
    expect(() => createSampleEntry(base(), ["받은 자료"], "회의.md", "md")).toThrow();
    expect(() => createSampleEntry(base(), ["받은 자료"], "../메모", "txt")).toThrow();
    expect(() => prepareSampleFileOperation(base(), operation("move", ["회의.md"], ["받은 자료"]))).toThrow();
    const state = createSampleEntry(base(), ["받은 자료"], "하위", "folder");
    expect(() => prepareSampleFileOperation(state, operation("copy", ["하위"], ["받은 자료", "하위"]))).toThrow();
    expect(() => prepareSampleFileOperation(base(), operation("trash", ["없음.md"]))).toThrow();
    expect(() => prepareSampleFileOperation(base(), operation("trash", ["회의.md", "회의.md"]))).toThrow();
  });
  it("복구도 덮어쓰지 않으며 알 수 없는 자산·중복 ID·깨진 부모 경로를 거부한다", () => {
    const edited = prepareSampleFileOperation(base(), { ...operation("edit"), text: "수정" }).next;
    expect(() => prepareSampleFileOperation(edited, { kind: "recover", source: [], names: [], destination: ["받은 자료"], archiveId: edited.archives[0].id })).toThrow();
    const state = base();
    expect(() => parseSampleFiles(catalog, { ...state, nodes: [...state.nodes, state.nodes[0]] })).toThrow();
    expect(() => parseSampleFiles(catalog, { ...state, nodes: state.nodes.map(node => node.id === "note" ? { ...node, assetId: "unknown" } : node) })).toThrow();
    expect(() => parseSampleFiles(catalog, { ...state, nodes: state.nodes.map(node => node.id === "note" ? { ...node, path: ["없는 부모", "회의.md"] } : node) })).toThrow();
  });
});

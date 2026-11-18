import { afterEach, describe, expect, it } from "vitest";
import { SampleWorkspaceStore } from "../../src/features/sample-workspace/sample-workspace-store";
import { SampleFileController } from "../../src/features/sample-workspace/files/sample-file-controller";
import type { SampleCatalog, SampleSession } from "../../src/shared/sample-contract";

const catalog: SampleCatalog = { version: "1", folders: [{ id: "work", label: "업무" }], documents: [
  { id: "note", name: "회의.md", format: "md", excerpt: "원문", proposal: { folderId: "work", reason: "업무", reviewRequired: false } },
] };
const session: SampleSession = { kind: "sample", id: "files-test", version: "1", expiresAt: Date.now() + 3_600_000 };
const closers: (() => void)[] = [];
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
function setup(storage = memory(), remainingMs = 3_600_000) {
  const store = new SampleWorkspaceStore(catalog, session, () => storage, remainingMs);
  closers.push(store.subscribe(() => {}));
  const files = new SampleFileController(catalog, store);
  return { store, files, storage };
}
afterEach(() => { closers.splice(0).forEach(close => close()); });
const request = { kind: "move" as const, source: ["받은 자료"], names: ["회의.md"], destination: ["정리한 자료", "업무"] };

describe("DFile: 공통 controller와 탭 저장소 경계", () => {
  it("한 이벤트의 연속 선택·해제에서 앞선 선택을 잃지 않으며 질문 선택과 분리한다", () => {
    const { files, store } = setup();
    const folderId = files.files().nodes.find(node => node.path.join("/") === "정리한 자료/업무")!.id;
    files.toggle("note");
    files.toggle(folderId);
    expect(files.files().selected).toEqual(["note", folderId]);
    files.toggle("note");
    files.toggle(folderId);
    expect(files.files().selected).toEqual([]);
    expect(store.getSnapshot().state.questionSelected).toBe(null);
  });
  it("계획 확인 전에는 변경하지 않고 명시 실행 뒤 F5에서도 파일·선택·보존본을 복원한다", async () => {
    const { files, storage } = setup();
    const before = JSON.stringify(files.files());
    await files.managed.open(request, true);
    await files.managed.review();
    expect(JSON.stringify(files.files())).toBe(before);
    await files.managed.start();
    expect(files.managed.getSnapshot().phase).toBe("completed");
    files.select(["note"]);
    const restored = setup(storage).files;
    expect(restored.files()).toEqual(files.files());
    expect(restored.view().locations.note).not.toBe(null);
    expect(restored.files().archives).toHaveLength(1);
    await files.managed.start();
    expect(files.files().archives).toHaveLength(1);
  });
  it("취소·계획 이후 변경·만료 세션은 실행하지 않는다", async () => {
    const { files } = setup();
    await files.managed.open(request, true);
    await files.managed.review();
    files.managed.close();
    expect(files.files().archives).toHaveLength(0);
    await files.managed.open(request, true);
    await files.managed.review();
    await files.create(["받은 자료"], "추가", "txt");
    await files.managed.start();
    expect(files.managed.getSnapshot().issue).toBe("managed-changed");
    expect(files.files().archives).toHaveLength(0);
    const expired = setup(memory(), 0).files;
    await expect(expired.create(["받은 자료"], "금지", "txt")).rejects.toThrow();
  });
  it("공통 편집 검토에서 수정 전 내용을 보관하고 서버 카탈로그를 바꾸지 않는다", async () => {
    const { files, store } = setup();
    await files.managed.open({ ...request, kind: "edit" });
    files.managed.setText("편집 내용");
    await files.managed.review();
    await files.managed.start();
    expect(files.files().nodes.find(node => node.id === "note")?.text).toBe("편집 내용");
    expect(files.files().archives[0].nodes[0].text).toBe("원문");
    expect(catalog.documents[0].excerpt).toBe("원문");
    expect(store.getSnapshot().state.locations.note).toBe(null);
  });
  it("보관 실패는 메모리 변경을 보존하고 경고하며 새 세션에는 이관하지 않는다", async () => {
    const storage = { getItem: () => null, setItem: () => { throw Error("quota"); } };
    const { files, store } = setup(storage);
    await files.create(["받은 자료"], "보관 실패", "txt");
    expect(files.files().nodes.some(node => node.path.at(-1) === "보관 실패.txt")).toBe(true);
    expect(store.getSnapshot().notice).toContain("새로고침");
    expect(setup().files.files().nodes.some(node => node.path.at(-1) === "보관 실패.txt")).toBe(false);
  });
});

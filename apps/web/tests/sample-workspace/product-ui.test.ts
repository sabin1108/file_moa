import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createSampleState, restoreSampleState, sampleQuestionSelection, transitionSampleState } from "../../src/features/sample-workspace/sample-state";
import { workspaceTourSteps, workspaceStepsFor } from "../../src/features/onboarding/workspace-tour-steps";
import type { SampleCatalog } from "../../src/shared/sample-contract";

const catalog: SampleCatalog = { version: "1", folders: [{ id: "work", label: "업무" }], documents: [{ id: "one", name: "회의.md", format: "md", excerpt: "회의 내용", proposal: { folderId: "work", reason: "회의", reviewRequired: false } }] };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {} }), usePathname: () => "/demo/files", useSearchParams: () => new URLSearchParams() }));

describe("demo presents the product UI", () => {
  it("keeps folder browsing free of demo-only AI classification and guided steps", async () => {
    const { SampleWorkspace } = await import("../../src/features/sample-workspace/SampleWorkspace");
    const html = renderToStaticMarkup(createElement(SampleWorkspace, { catalog,
      session: { kind: "sample", id: "files-ui", version: "1", expiresAt: 1 }, remainingMs: 0,
      view: "files", answerAction: async () => ({ ok: false, code: "unavailable" } as const), organizeAction: async () => ({ ok: false, code: "unavailable" } as const) }));
    expect(html).toContain('aria-label="자료 폴더 탐색"');
    expect(html).not.toContain("AI로 분류 제안");
    expect(html).not.toContain("자료 선택</span>");
    expect(html).not.toContain("처음부터 다시");
  });
  it("uses the same selection toolbar without advertising unavailable file operations", async () => {
    const { FileSelectionToolbar } = await import("../../src/features/local-folders/browsing/file-list/FileSelectionToolbar");
    const props = { selectedCount: 1, visibleSelectedCount: 1, fileCount: 2, selectedFolderCount: 0, hiddenSelectedCount: 0, disabled: false,
      onSelectAll() {}, onClearVisible() {}, onClear() {}, onReviewPlan: undefined };
    const picker = renderToStaticMarkup(createElement(FileSelectionToolbar, props));
    expect(picker).toContain("전체 선택 해제");
    expect(picker).not.toContain("복사");
    expect(picker).not.toContain("이동");
    const operations = renderToStaticMarkup(createElement(FileSelectionToolbar, { ...props, onReviewPlan() {} }));
    expect(operations).toContain("복사");
    expect(operations).toContain("이동");
  });
  it("starts and resets without implicitly checking sample documents", () => {
    const initial = createSampleState(catalog);
    expect(initial.selected).toEqual([]);
    const selected = transitionSampleState(catalog, initial, { type: "select", ids: ["one"] });
    expect(selected.selected).toEqual(["one"]);
    expect(transitionSampleState(catalog, selected, { type: "reset" }).selected).toEqual([]);
  });
  it("starts a grounded question with website documents instead of an oversized previous selection", () => {
    const websiteCatalog: SampleCatalog = { ...catalog, folders: [...catalog.folders, { id: "web", label: "받은 자료/개발/웹사이트 문서" }],
      documents: Array.from({ length: 79 }, (_, index) => ({ ...catalog.documents[0], id: `doc-${index}`, name: `${index}.md`, sourceFolderId: index < 3 ? "web" : "work" })) };
    const initial = createSampleState(websiteCatalog);
    const all = transitionSampleState(websiteCatalog, initial, { type: "select", ids: websiteCatalog.documents.map(document => document.id) });
    const question = transitionSampleState(websiteCatalog, all, { type: "mode", mode: "grounded" });
    expect(question.questionSelected).toEqual(["doc-0", "doc-1", "doc-2"]);
    expect(question.selected).toEqual(all.selected);
    expect(question.path).toEqual(["받은 자료", "개발", "웹사이트 문서"]);
    const cleared = transitionSampleState(websiteCatalog, question, { type: "select-question", ids: [] });
    expect(transitionSampleState(websiteCatalog, cleared, { type: "mode", mode: "grounded" }).questionSelected).toEqual([]);
    expect(sampleQuestionSelection(websiteCatalog, restoreSampleState(websiteCatalog, JSON.stringify(cleared)))).toEqual([]);
  });
  it("caps the initial question set by document and excerpt limits, and rejects extra selections without changing folders", () => {
    const large: SampleCatalog = { ...catalog, folders: [{ id: "web", label: "받은 자료/개발/웹사이트 문서" }],
      documents: Array.from({ length: 79 }, (_, index) => ({ ...catalog.documents[0], id: `doc-${index}`, name: `${index}.md`, sourceFolderId: "web", excerpt: "가".repeat(200) })) };
    const initial = createSampleState(large);
    expect(sampleQuestionSelection(large, initial)).toHaveLength(30);
    expect(() => transitionSampleState(large, initial, { type: "select-question", ids: large.documents.slice(0, 31).map(document => document.id) })).toThrow();
    expect(() => transitionSampleState(large, initial, { type: "select-question", ids: ["forged"] })).toThrow();
    const short = { ...large, documents: large.documents.map(document => ({ ...document, excerpt: "짧음" })) };
    expect(sampleQuestionSelection(short, createSampleState(short))).toHaveLength(40);
  });
  it("keeps explicit folder selection from cancelling a reviewed plan or inheriting its checks", () => {
    const selected = transitionSampleState(catalog, createSampleState(catalog), { type: "select", ids: ["one"] });
    const plan = transitionSampleState(catalog, selected, { type: "propose" });
    expect(plan.fileSelected).toEqual([]);
    const browsed = transitionSampleState(catalog, plan, { type: "select-files", ids: ["one"] });
    expect(browsed).toEqual({ ...plan, fileSelected: ["one"] });
    const result = transitionSampleState(catalog, browsed, { type: "apply" });
    const cleared = transitionSampleState(catalog, result, { type: "select-files", ids: [] });
    expect(cleared).toEqual({ ...result, fileSelected: [] });
    expect(restoreSampleState(catalog, JSON.stringify(cleared))).toEqual(cleared);
  });
  it("keeps old sessions and missing website folders safe without inventing question sources", () => {
    const legacy = JSON.parse(JSON.stringify(createSampleState(catalog)));
    delete legacy.questionSelected;
    delete legacy.fileSelected;
    const restored = restoreSampleState(catalog, JSON.stringify(legacy));
    expect(restored.questionSelected).toBeNull();
    expect(restored.fileSelected).toEqual([]);
    expect(sampleQuestionSelection(catalog, restored)).toEqual([]);
  });
  it("locks organization result selection while keeping the separate question picker usable", async () => {
    const { SampleFolderPanel } = await import("../../src/features/sample-workspace/files/SampleFolderPanel");
    const props = { catalog, state: { locations: { one: "work" }, selected: ["one"], phase: "result" as const }, path: ["정리한 자료", "업무"],
      onOpen() {}, onPreview() {}, onToggle() {}, disabled: false };
    const result = renderToStaticMarkup(createElement(SampleFolderPanel, props));
    expect(result).toMatch(/aria-label="회의.md 선택"[^>]*disabled/);
    const question = renderToStaticMarkup(createElement(SampleFolderPanel, { ...props, selecting: true }));
    expect(question).not.toMatch(/aria-label="회의.md 선택"[^>]*disabled/);
  });
  it("uses the same 17 tour steps and selectors, with only workspace routes mapped", () => {
    expect(workspaceStepsFor("live")).toBe(workspaceTourSteps);
    const demo = workspaceStepsFor("sample");
    expect(demo).toHaveLength(17);
    for (const [index, step] of demo.entries()) {
      expect(step.selector).toBe(workspaceTourSteps[index].selector);
      expect(step.title).toBe(workspaceTourSteps[index].title);
      if (step.selector.includes("folder-connection")) expect(step.text).toContain("준비된 예시 폴더");
      else expect(step.text).toBe(workspaceTourSteps[index].text);
      expect(step.recordKind).toBe(workspaceTourSteps[index].recordKind);
      expect(step.route === null || step.route.startsWith("/demo")).toBe(true);
    }
  });
  it("keeps task meaning and puts the example in the shared input placeholder", async () => {
    const { ConversationTaskControls, ConversationTaskIntro, conversationInputPlaceholder } = await import("../../src/features/conversation-workspace/material-work/ConversationTaskControls");
    const html = renderToStaticMarkup(createElement(ConversationTaskControls, { mode: "find", disabled: false, onChoose() {} }));
    expect(html).toContain('aria-label="대화 작업"');
    expect(html).toContain("단어와 날짜로 파일을 찾아요");
    expect(html).not.toContain("입력 예시");
    expect(conversationInputPlaceholder("find")).toContain("\n예: 성능 찾아줘");
    const intro = renderToStaticMarkup(createElement(ConversationTaskIntro, { mode: "grounded", disabled: false, onChoose() {} }));
    expect(intro).toContain("자료로 질문 시작하기");
    expect(intro).toContain("선택한 자료를 참고해 답변받아요");
  });
});

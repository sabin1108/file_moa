import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSampleState, transitionSampleState } from "../../src/features/sample-workspace/sample-state";
import { workspaceTourSteps, workspaceStepsFor } from "../../src/features/onboarding/workspace-tour-steps";
import type { SampleCatalog } from "../../src/shared/sample-contract";

const catalog: SampleCatalog = { version: "1", folders: [{ id: "work", label: "업무" }], documents: [{ id: "one", name: "회의.md", format: "md", excerpt: "회의 내용", proposal: { folderId: "work", reason: "회의", reviewRequired: false } }] };

describe("demo presents the product UI", () => {
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
  it("explains the current task and marks example controls as filling the draft only", async () => {
    const { ConversationTaskControls, ConversationTaskIntro } = await import("../../src/features/conversation-workspace/material-work/ConversationTaskControls");
    const html = renderToStaticMarkup(createElement(ConversationTaskControls, { mode: "find", disabled: false, onChoose() {}, onExample() {} }));
    expect(html).toContain('aria-label="대화 작업"');
    expect(html).toContain("단어와 날짜로 파일을 찾아요");
    expect(html).toContain("입력 예시");
    expect(html).toContain("자동으로 실행하지 않아요");
    const intro = renderToStaticMarkup(createElement(ConversationTaskIntro, { mode: "grounded", disabled: false, onChoose() {} }));
    expect(intro).toContain("자료로 질문 시작하기");
    expect(intro).toContain("선택한 자료를 참고해 답변받아요");
  });
});

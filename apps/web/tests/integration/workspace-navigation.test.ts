import { describe, expect, it } from "vitest";
import {
  canStartQuickHold,
  clampQuickPosition,
  matchesQuickShortcut,
  parseQuickPreferences,
  quickDirection,
  shortcutFromEvent
} from "../../src/features/quick-switch/quick-switch";
import { selectOrganizationCandidates } from "../../src/features/sample-workspace/organization/organization-candidates";
import { workspaceFolderNodes } from "../../src/components/layout/workspace-folder-nodes";

describe("workspace navigation boundaries", () => {
  it("recovers malformed preferences and accepts only supported shortcut combinations", () => {
    for (const value of [null, "{", "null", '"hold"', '{"trigger":"hold","shortcut":"Delete"}']) expect(parseQuickPreferences(value)).toEqual({ trigger: "both", shortcut: "Alt+Q" });

    expect(parseQuickPreferences('{"trigger":"keyboard","shortcut":"Ctrl+Shift+K"}')).toEqual({ trigger: "keyboard", shortcut: "Ctrl+Shift+K" });

    const key = {
      code: "KeyK",
      altKey: false,
      ctrlKey: true,
      shiftKey: true,
      metaKey: false,
      isComposing: false,
      repeat: false
    };

    expect(matchesQuickShortcut(key, "Ctrl+Shift+K")).toBe(true);

    for (const extra of [{ isComposing: true }, { repeat: true }, { metaKey: true }, { altKey: true }, { shiftKey: false }]) expect(matchesQuickShortcut({ ...key, ...extra }, "Ctrl+Shift+K")).toBe(false);
  });
  it("reserves hold for blank primary mouse areas and keeps the radial menu inside the viewport", () => {
    const pointer = { button: 0, primary: true, pointerType: "mouse", blocked: false, hasSelection: false };

    expect(canStartQuickHold(pointer)).toBe(true);

    for (const extra of [{ button: 2 }, { primary: false }, { pointerType: "touch" }, { blocked: true }, { hasSelection: true }]) expect(canStartQuickHold({ ...pointer, ...extra })).toBe(false);

    expect(clampQuickPosition(0, 1000, 390, 844)).toEqual({ x: 120, y: 724 });
    expect(clampQuickPosition(1000, 0, 1440, 900)).toEqual({ x: 1000, y: 120 });
  });
  it("builds unique parent nodes from supplied paths without inventing children", () => {
    const nodes = workspaceFolderNodes("자료", [["A", "B"], ["A", "C"], ["A", "B"]]);

    expect(nodes.map(node => node.path)).toEqual([[], ["A"], ["A", "B"], ["A", "C"]]);
  });
  it("keeps whole subtrees together even when sibling names share punctuation", () => {
    const nodes = workspaceFolderNodes("자료", [["A", "Z"], ["A-2"], ["A", ".hidden", "child"], ["A.B"]]);
    const parent = nodes.findIndex(node => JSON.stringify(node.path) === '["A"]');
    const descendants = nodes.slice(parent + 1, parent + 4);

    expect(descendants.every(node => node.path[0] === "A")).toBe(true);
  });
  it("selects directions outside the circle and cancels in its center", () => {
    expect(quickDirection(0, -300)).toBe(0);
    expect(quickDirection(600, 340)).toBe(1);
    expect(quickDirection(-600, 340)).toBe(2);
    expect(quickDirection(30, 20)).toBeNull();
  });
  it("records an arbitrary supported physical key combo including CapsLock", () => {
    const event = {
      code: "KeyJ",
      altKey: true,
      ctrlKey: true,
      shiftKey: false,
      metaKey: false,
      isComposing: false,
      repeat: false
    };

    expect(shortcutFromEvent(event)).toBe("Ctrl+Alt+J");
    expect(matchesQuickShortcut(event, "Ctrl+Alt+J")).toBe(true);
    expect(shortcutFromEvent({ ...event, code: "CapsLock", altKey: false, ctrlKey: false })).toBe("CapsLock");
    expect(shortcutFromEvent({ ...event, code: "ControlLeft" })).toBeNull();
    expect(shortcutFromEvent({ ...event, isComposing: true })).toBeNull();
    expect(parseQuickPreferences('{"trigger":"keyboard","shortcut":"Ctrl+Alt+J"}').shortcut).toBe("Ctrl+Alt+J");
  });
  it("uses body relevance ahead of misleading titles, caps a stable shortlist, and never expands the chosen scope", () => {
    const documents = Array.from(
      { length: 84 },
      (_, i) => ({
        id: `d${i}`,
        name: i === 0 ? "매출 보고서.md" : "메모.md",
        excerpt: i === 83 ? "매출과 비용을 비교한 영업 분석 자료" : "개인 학습 일정"
      })
    );
    const candidates = selectOrganizationCandidates(documents, "매출 자료를 모아 줘");

    expect(candidates).toHaveLength(40);
    expect(candidates[0].id).toBe("d83");
    expect(selectOrganizationCandidates(documents.slice(3, 7), "매출 자료").map(item => item.id)).toEqual(["d3", "d4", "d5", "d6"]);
    expect(selectOrganizationCandidates(documents, "무관한 요청")).toEqual(documents.slice(0, 40));
    expect(selectOrganizationCandidates(
      documents.map(document => ({ ...document, excerpt: "가".repeat(900) })),
      "자료"
    )).toHaveLength(5);
  });
});

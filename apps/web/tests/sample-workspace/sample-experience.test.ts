import { describe, expect, it } from "vitest";
import type { SampleCatalog } from "../../src/shared/sample-contract";
import { createSampleState, restoreSampleState, transitionSampleState } from "../../src/features/sample-workspace/sample-state";
import { SampleWorkspaceStore } from "../../src/features/sample-workspace/sample-workspace-store";

const catalog: SampleCatalog = {
  version: "1", folders: [{ id: "work", label: "업무" }], documents: [
    { id: "meeting", name: "회의.md", format: "md", excerpt: "작성일: 2026-10-12. 성능 테스트에서 응답 시간을 줄이기로 결정했다.", proposal: { folderId: "work", reason: "업무", reviewRequired: false } },
    { id: "other", name: "개인.txt", format: "txt", excerpt: "작성일: 2025-10-12. 성능 관련 메모", proposal: { folderId: "work", reason: "업무", reviewRequired: false } },
  ],
};
const reply = (mode: "chat" | "find" | "grounded", question: string, selectedIds = ["meeting", "other"]) => ({ type: "sample-reply" as const, mode, question, selectedIds, referenceYear: 2026 });
const generated = (mode: "chat" | "grounded", citations = mode === "grounded" ? [{ documentId: "meeting", quote: "성능 테스트에서 응답 시간을 줄이기로 결정했다." }] : []) => ({
  type: "ai-answer" as const, requestId: crypto.randomUUID(), mode, question: "질문", result: { ok: true as const, answer: { answer: "응답 시간을 줄이기로 했습니다.", citations }, model: "gpt-6-luna", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
});

describe("demo state and local search experience", () => {
  it("retains prior source results when switching tasks and keeps the source answer with citations", () => {
    let state = transitionSampleState(catalog, createSampleState(catalog), reply("find", "성능 찾아줘"));
    state = transitionSampleState(catalog, state, { type: "select-question", ids: ["meeting"] });
    state = transitionSampleState(catalog, state, generated("grounded"));
    const sourceReply = state.sourceReply;
    state = transitionSampleState(catalog, state, generated("chat"));
    expect(state.findings).toEqual(["meeting", "other"]);
    expect(state.citations).toEqual(["meeting"]);
    expect(state.sourceReply).toBe(sourceReply);
    expect(state.sourceReply).toContain("응답 시간");
  });
  it("tells the user to confirm unclear dates and retains the question", () => {
    const store = new SampleWorkspaceStore(catalog, { kind: "sample", id: "dates", expiresAt: Date.now() + 1000, version: "1" }, () => ({ getItem: () => null, setItem: () => {} }));
    const off = store.subscribe(() => {});
    store.dispatch({ type: "draft", value: "올해 성능 찾아줘" });
    store.dispatch(reply("find", "올해 성능 찾아줘"));
    expect(store.getSnapshot().notice).toContain("기간");
    expect(store.getSnapshot().state.draft).toBe("올해 성능 찾아줘");
    off();
  });
  it("shares four tasks and restores mode, draft, guide and completed results without replay", () => {
    let state = transitionSampleState(catalog, createSampleState(catalog), { type: "mode", mode: "find" });
    state = transitionSampleState(catalog, state, reply("find", "성능 찾아줘"));
    state = transitionSampleState(catalog, state, { type: "draft", value: "다음 질문" });
    state = transitionSampleState(catalog, state, { type: "guide", step: 2, dismissed: true });
    expect(state.findings).toEqual(["meeting", "other"]);
    expect(restoreSampleState(catalog, JSON.stringify(state))).toEqual(state);
    expect(state.messages).toHaveLength(2);
    expect(state.mode).toBe("find");
  });
  it("uses product date rules and respects the supplied search scope", () => {
    const state = transitionSampleState(catalog, createSampleState(catalog), reply("find", "2026년 10월 작성일 기준 성능 찾아줘"));
    expect(state.findings).toEqual(["meeting"]);
    const narrow = transitionSampleState(catalog, state, reply("find", "성능 찾아줘", ["other"]));
    expect(narrow.findings).toEqual(["other"]);
    expect(() => transitionSampleState(catalog, state, reply("find", "올해 성능 찾아줘"))).toThrow();
  });
  it("only quotes selected sources and rejects missing or forged selections", () => {
    const state = createSampleState(catalog);
    expect(() => transitionSampleState(catalog, state, reply("grounded", "요약해줘", []))).toThrow();
    expect(() => transitionSampleState(catalog, state, reply("grounded", "요약해줘", ["forged"]))).toThrow();
    expect(() => transitionSampleState(catalog, state, generated("grounded"))).toThrow();
    const selected = transitionSampleState(catalog, state, { type: "select-question", ids: ["meeting"] });
    const answer = transitionSampleState(catalog, selected, generated("grounded"));
    expect(answer.citations).toEqual(["meeting"]);
    expect(answer.messages.at(-1)?.text).toContain("응답 시간");
    expect(answer.messages.at(-1)?.text).not.toContain("개인.txt");
  });
  it("does not retain a prepared reply path for general or grounded questions", () => {
    expect(() => transitionSampleState(catalog, createSampleState(catalog), reply("chat", "질문"))).toThrow("sample-api-required");
    expect(() => transitionSampleState(catalog, createSampleState(catalog), reply("grounded", "질문"))).toThrow("sample-api-required");
  });
  it("protects reviewed plans from mode changes and preserves drafts on normal switching", () => {
    const state = transitionSampleState(catalog, createSampleState(catalog), { type: "draft", value: "보존" });
    expect(transitionSampleState(catalog, state, { type: "mode", mode: "chat" }).draft).toBe("보존");
    const selected = transitionSampleState(catalog, state, { type: "select", ids: ["meeting"] });
    const plan = transitionSampleState(catalog, selected, { type: "propose" });
    expect(() => transitionSampleState(catalog, plan, { type: "mode", mode: "chat" })).toThrow();
  });
  it("restores old sessions with defaults and rejects invalid guide/source records", () => {
    const old = createSampleState(catalog);
    const { mode, findings, citations, sourceReply, scope, path, guideStep, guideDismissed, records, ...legacy } = old;
    expect(restoreSampleState(catalog, JSON.stringify(legacy)).mode).toBeNull();
    for (const patch of [{ findings: ["forged"] }, { citations: ["forged"] }, { guideStep: 7 }]) {
      expect(() => restoreSampleState(catalog, JSON.stringify({ ...old, ...patch }))).toThrow();
    }
    expect([mode, findings, citations, sourceReply, scope, path, guideStep, guideDismissed, records]).toHaveLength(9);
    expect(restoreSampleState(catalog, JSON.stringify(legacy))).toMatchObject({ sourceReply: "", scope: "all", path: ["받은 자료"] });
  });
  it("persists and removes sample records without changing sources and resets only demo state", () => {
    let state = createSampleState(catalog);
    const before = state.locations;
    state = transitionSampleState(catalog, state, { type: "save-record", record: { id: "record-1", kind: "memory", title: "답변 방식", content: "짧게 설명", approved: false, sources: [] } });
    state = transitionSampleState(catalog, state, { type: "save-record", record: { ...state.records[0], approved: true } });
    expect(restoreSampleState(catalog, JSON.stringify(state)).records[0].approved).toBe(true);
    expect(state.locations).toEqual(before);
    expect(transitionSampleState(catalog, state, { type: "remove-record", id: "record-1" }).records).toEqual([]);
    expect(transitionSampleState(catalog, state, { type: "reset" }).records).toEqual([]);
  });
});

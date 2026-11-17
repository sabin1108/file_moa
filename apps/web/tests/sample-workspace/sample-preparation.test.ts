import { describe, expect, it, vi } from "vitest";
import { SampleWorkspaceStore } from "../../src/features/sample-workspace/sample-workspace-store";
import { createSampleState, restoreSampleState, sampleQuestionSelection, transitionSampleState } from "../../src/features/sample-workspace/sample-state";
import type { SampleCatalog } from "../../src/shared/sample-contract";
import type { SampleOrganizationAction } from "../../src/shared/sample-organization";
import catalogJson from "../../src/server/demo/sample-data/catalog.json";
import organizationDocuments from "../../src/server/demo/sample-data/organization-documents.json";
import businessDocuments from "../../src/server/demo/sample-data/business-documents.json";

const catalog: SampleCatalog = { version: "1", folders: [{ id: "source", label: "받은 자료/개발/웹사이트 문서" }], documents: [
  { id: "one", name: "회의.md", format: "md", sourceFolderId: "source", excerpt: "보안을 확인하고 백업과 복구를 준비합니다.", proposal: { folderId: "source", reason: "자료", reviewRequired: false } },
] };
const usage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };
function fixture() {
  const store = new SampleWorkspaceStore(catalog, { kind: "sample", version: "1", id: "prep", expiresAt: Date.now() + 3600000 }, () => ({ getItem: () => null, setItem: () => {} }));
  const off = store.subscribe(() => {});
  return { store, off, controller: store.organization };
}

describe("shared demo organization preparation", () => {
  it("turns an empty or unclear proposal into the next basis question without applying or resending", async () => {
    const { store, controller, off } = fixture();
    controller.update({ request: "자료 정리", scope: { kind: "all" }, basis: "알아서 보기 편하게 해줘" });
    await controller.prepare();
    const action: SampleOrganizationAction = vi.fn().mockResolvedValue({ ok: true, model: "fixture", usage,
      organization: { summary: "업무별로 나눌까요, 주제별로 나눌까요?", matches: [], held: [] }, questions: [] });
    controller.consent(true);
    await controller.sendPrepared(async prepared => await store.requestOrganization(action, prepared.basis, prepared.selectedIds,
      { reference: null, destination: null, answers: [] }) ?? { ok: false, code: "unavailable" });
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", conversationStep: "basis", selectedIds: ["one"], consentKey: null, questions: [], reviewConfirmed: false,
      issue: "업무별로 나눌까요, 주제별로 나눌까요?" });
    await controller.replyToConversation("프로젝트별로 나눠줘");
    expect(controller.getSnapshot().basis).toBe("프로젝트별로 나눠줘");
    expect(action).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state.locations.one).toBe("source");
    off();
  });
  it("preserves selected materials after malformed output and requires renewed consent after a recovery answer", async () => {
    const { store, controller, off } = fixture();
    controller.update({ request: "자료 정리", scope: { kind: "all" }, basis: "내용별 중요성 별로 정리해줄래" });
    await controller.prepare();
    const action: SampleOrganizationAction = vi.fn().mockResolvedValue({ ok: false, code: "unavailable", reason: "invalid-json",
      questions: [{ id: "one:destination", documentId: "one", kind: "destination", reason: "분류 확인", dates: [] }] });
    const transfer = () => controller.sendPrepared(async prepared => await store.requestOrganization(action, prepared.basis, prepared.selectedIds,
      { reference: null, destination: null, answers: [...prepared.answers] }) ?? { ok: false, code: "unavailable" });
    controller.consent(true);
    await transfer();
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", selectedIds: ["one"], result: null, questions: [{ documentId: "one" }] });
    expect(store.getSnapshot().notice).toContain("선택한 자료는 유지");
    expect(action).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state.locations.one).toBe("source");
    await controller.replyToConversation("모두 상 폴더로");
    expect(controller.getSnapshot().answers).toEqual([{ documentId: "one", destination: ["상"] }]);
    await transfer();
    expect(action).toHaveBeenCalledOnce();
    controller.consent(true);
    await transfer();
    expect(action).toHaveBeenCalledTimes(2);
    expect(vi.mocked(action).mock.calls[1][0].context?.answers).toEqual([{ documentId: "one", destination: ["상"] }]);
    off();
  });
  it("restores a generated subfolder under a deep chosen base without losing the plan", () => {
    const context = { reference: null, destination: ["받은 자료", "개발", "웹사이트 문서"], answers: [] };
    const proposed = transitionSampleState(catalog, createSampleState(catalog), { type: "organization-propose", instruction: "주제별로", candidateIds: ["one"], context,
      result: { ok: true, model: "fixture", usage, organization: { summary: "검토할 제안", matches: [{ documentId: "one", destination: ["안전", "보존"], evidence: catalog.documents[0].excerpt, date: null }], held: [] } } });
    expect(proposed.createdFolders[0].label).toBe("받은 자료/개발/웹사이트 문서/안전/보존");
    expect(restoreSampleState(catalog, JSON.stringify(proposed)).targets).toEqual(proposed.targets);
  });
  it("starts without an initial chat, asks one condition at a time, goes back, and never sends during preparation", async () => {
    const { store, off, controller } = fixture();
    const action = vi.fn();
    controller.update({ request: "자료 정리" });
    await controller.beginConversation();
    expect(controller.getSnapshot().conversationStep).toBe("scope");
    await controller.replyToConversation("웹사이트 문서");
    expect(controller.getSnapshot()).toMatchObject({ conversationStep: "coverage", scope: { kind: "folder", path: ["받은 자료", "개발", "웹사이트 문서"] } });
    await controller.replyToConversation("하위 폴더까지 포함해줘");
    expect(controller.getSnapshot().conversationStep).toBe("basis");
    controller.backConversation();
    expect(controller.getSnapshot().conversationStep).toBe("coverage");
    await controller.replyToConversation("이 폴더 파일만");
    await controller.replyToConversation("중요도에 따라 상 중 하로 분류해줘");
    await controller.replyToConversation("나중에 정할게");
    expect(controller.getSnapshot().conversationStep).toBe("confirm");
    await controller.replyToConversation("자료 확인 실행");
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", selectedIds: ["one"] });
    await controller.sendPrepared(action);
    expect(action).not.toHaveBeenCalled();
    expect(store.getSnapshot().state.locations.one).toBe("source");
    off();
  });

  it("reuses review answers and consent for reanalysis, then applies and restores only sample changes", async () => {
    const { store, controller, off } = fixture();
    controller.update({ request: "자료 정리", scope: { kind: "all" }, basis: "주제별", destination: null });
    await controller.prepare();
    const action: SampleOrganizationAction = vi.fn().mockResolvedValueOnce({ ok: true, model: "fixture", usage,
      organization: { summary: "목적지를 확인해 주세요", matches: [], held: [{ documentId: "one", reason: "목적지 확인" }] },
      questions: [{ id: "one-destination", documentId: "one", kind: "destination", reason: "목적지 확인", dates: [] }] });
    const transfer = () => controller.sendPrepared(async prepared => await store.requestOrganization(action, prepared.basis, prepared.selectedIds,
      { reference: null, destination: null, answers: [...prepared.answers] }) ?? { ok: false, code: "unavailable" });
    controller.consent(true);
    await transfer();
    expect(controller.getSnapshot().questions).toHaveLength(1);
    await controller.replyToConversation("모두 보안 폴더로");
    expect(controller.getSnapshot().answers).toEqual([{ documentId: "one", destination: ["보안"] }]);
    expect(controller.getSnapshot().consentKey).toBeNull();
    await transfer();
    expect(action).toHaveBeenCalledTimes(1);
    vi.mocked(action).mockResolvedValueOnce({ ok: true, model: "fixture", usage, organization: { summary: "검토할 제안", held: [], matches: [
      { documentId: "one", destination: ["보안"], evidence: catalog.documents[0].excerpt, date: null },
    ] } });
    controller.consent(true);
    await transfer();
    expect(action).toHaveBeenCalledTimes(2);
    expect(vi.mocked(action).mock.calls[1][0].context?.answers[0].destination).toEqual(["보안"]);
    store.dispatch({ type: "apply" });
    expect(store.getSnapshot().state.phase).toBe("result");
    expect(store.getSnapshot().state.locations.one).toMatch(/^custom-/u);
    const restored = restoreSampleState(catalog, JSON.stringify(store.getSnapshot().state));
    expect(restored.locations.one).toBe(store.getSnapshot().state.locations.one);
    store.dispatch({ type: "undo" });
    expect(store.getSnapshot().state.locations.one).toBe("source");
    off();
  });

  it("lets every supplied catalog excerpt be selected without a silent forty-document cut", () => {
    const all = [...catalogJson.documents, ...organizationDocuments, ...businessDocuments];
    const provided = { ...catalog, documents: all.map(document => ({ ...document, format: document.format as SampleCatalog["documents"][number]["format"], sourceFolderId: "source" })) };
    const state = createSampleState(provided);
    expect(all).toHaveLength(84);
    const selected = transitionSampleState(provided, state, { type: "select-question", ids: all.map(document => document.id) });
    expect(sampleQuestionSelection(provided, selected)).toHaveLength(84);
    expect(restoreSampleState(provided, JSON.stringify(selected)).questionSelected).toHaveLength(84);
  });
});

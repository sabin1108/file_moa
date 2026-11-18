import { afterEach, describe, expect, it, vi } from "vitest";
import { SampleWorkspaceStore } from "../../src/features/sample-workspace/sample-workspace-store";
import type { SampleCatalog, SampleSession } from "../../src/shared/sample-contract";
import type { SampleAiResult } from "../../src/shared/sample-ai";
import type { SampleOrganizationResult } from "../../src/shared/sample-organization";

const catalog: SampleCatalog = {
  version: "1",
  folders: [{ id: "meeting", label: "업무/회의" }],
  documents: [
    {
      id: "one",
      name: "회의.md",
      format: "md",
      excerpt: "회의 기록",
      proposal: { folderId: "meeting", reason: "회의 내용", reviewRequired: false }
    },
  ]
};
const session = (id: string): SampleSession => ({ kind: "sample", id, expiresAt: Date.now() + 3600000, version: "1" });
const memory = () => {
  const records = new Map<string, string>();

  return {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    }
  };
};

afterEach(() => vi.useRealTimers());

describe("sample session storage boundary", () => {
  it("retains received text if the completed organization plan fails the final client check", async () => {
    const store = new SampleWorkspaceStore(catalog, session("invalid-stream-plan"), memory);
    const off = store.subscribe(() => {});
    const result = await store.requestOrganization(async (_input, onText) => {
      onText?.("자료를 검토한 제안입니다.");
      return { ok: true, model: "fixture", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        organization: { summary: "자료를 검토한 제안입니다.", matches: [{ documentId: "outside", destination: ["회의"], evidence: "확인할 수 없는 외부 근거입니다.", date: null }], held: [] } };
    }, "주제별로 정리", ["one"]);
    expect(result).toMatchObject({ ok: false, reason: "invalid-plan" });
    expect(store.getSnapshot().state).toMatchObject({ phase: "select", organization: null });
    expect(store.getSnapshot().state.messages.at(-1)?.text).toContain("검증하지 못한 답변");
    off();
  });
  it("keeps a canceled organization draft and ignores its late plan without replay on reload", async () => {
    const storage = memory();
    const contentCatalog: SampleCatalog = { ...catalog, documents: [{ ...catalog.documents[0], excerpt: "회의 기록과 다음 일정입니다." }] };
    const store = new SampleWorkspaceStore(contentCatalog, session("content-late"), () => storage);
    const off = store.subscribe(() => { });
    store.dispatch({ type: "select", ids: ["one"] });
    let finish!: (result: SampleOrganizationResult) => void;
    const action = vi.fn().mockImplementation(() => new Promise<SampleOrganizationResult>(resolve => {
      finish = resolve;
    }));
    const pending = store.requestOrganization(action, "회의 자료 모아 줘", ["one"]);

    await store.requestOrganization(action, "다른 요청", ["one"]);
    expect(action).toHaveBeenCalledTimes(1);
    store.cancelAi();
    finish({
      ok: true,
      model: "gemini-3.5-flash-lite",
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      organization: {
        summary: "회의 자료예요.",
        matches: [{ documentId: "one", destination: ["회의"], evidence: "회의 기록과 다음 일정입니다.", date: null }],
        held: [],
      }
    });
    await pending;
    expect(store.getSnapshot()).toMatchObject({
      aiPending: false,
      state: { phase: "select", draft: "회의 자료 모아 줘", organization: null, createdFolders: [] }
    });

    const reload = new SampleWorkspaceStore(contentCatalog, session("content-late"), () => storage);
    const offReload = reload.subscribe(() => { });

    expect(reload.getSnapshot().state.draft).toBe("회의 자료 모아 줘");
    expect(reload.getSnapshot().aiPending).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    off();
    offReload();
  });

  const aiResult: SampleAiResult = {
    ok: true,
    model: "gemini-3.5-flash-lite",
    proposals: [{ documentId: "one", folderId: "meeting", reason: "실제 AI 제안 근거", reviewRequired: false }],
    usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 }
  };

  it("persists the AI proposal without executing it or repeating the request on reload", async () => {
    const storage = memory();
    const store = new SampleWorkspaceStore(catalog, session("ai"), () => storage);
    const off = store.subscribe(() => { });
    store.dispatch({ type: "select", ids: ["one"] });
    const request = vi.fn().mockResolvedValue(aiResult);

    await store.requestAi(request);
    expect(store.getSnapshot()).toMatchObject({
      aiPending: false,
      state: {
        phase: "review",
        locations: { one: null },
        ai: { proposals: aiResult.ok ? aiResult.proposals : [] }
      }
    });

    const restored = new SampleWorkspaceStore(catalog, session("ai"), () => storage);
    const offRestored = restored.subscribe(() => { });

    expect(restored.getSnapshot().state).toEqual(store.getSnapshot().state);
    expect(request).toHaveBeenCalledTimes(1);
    off();
    offRestored();
  });

  it.each(["cancel", "reset", "unmount", "expire"])("ignores a late AI result after %s and blocks double submission", async action => {
    vi.useFakeTimers();

    const store = new SampleWorkspaceStore(catalog, session("late"), () => memory(), 1000);
    const off = store.subscribe(() => { });
    store.dispatch({ type: "select", ids: ["one"] });
    let finish!: (result: SampleAiResult) => void;
    const request = vi.fn().mockImplementation(() => new Promise<SampleAiResult>(resolve => {
      finish = resolve;
    }));
    const pending = store.requestAi(request);

    await store.requestAi(request);
    expect(request).toHaveBeenCalledTimes(1);

    if (action === "cancel") store.cancelAi();

    if (action === "reset") store.dispatch({ type: "reset" });

    if (action === "unmount") off();

    if (action === "expire") vi.advanceTimersByTime(1000);

    finish(aiResult);
    await pending;
    expect(store.getSnapshot()).toMatchObject({ aiPending: false, state: { phase: "select", ai: null, locations: { one: null } } });
    off();
  });

  it("shows quota/network failures without silently substituting a prepared proposal", async () => {
    const store = new SampleWorkspaceStore(catalog, session("failed"), () => memory());
    const off = store.subscribe(() => { });
    store.dispatch({ type: "select", ids: ["one"] });

    await store.requestAi(async () => ({ ok: false, code: "limit", retryAfter: 30 }));
    expect(store.getSnapshot()).toMatchObject({ aiPending: false, state: { phase: "select" } });
    expect(store.getSnapshot().notice).toContain("30초");
    await store.requestAi(async () => {
      throw new Error("private-transport-error");
    });
    expect(store.getSnapshot().notice).not.toContain("private-transport-error");
    expect(store.getSnapshot().state.ai).toBeNull();
    off();
  });

  it("SAMPLE-002 keeps session state separate and restores only its own records", () => {
    const storage = memory();
    const first = new SampleWorkspaceStore(catalog, session("first"), () => storage);
    const second = new SampleWorkspaceStore(catalog, session("second"), () => storage);
    const offFirst = first.subscribe(() => { }), offSecond = second.subscribe(() => { });

    first.dispatch({ type: "select", ids: ["one"] });
    first.dispatch({ type: "propose" });
    first.dispatch({ type: "apply" });
    expect(first.getSnapshot().state.locations.one).toBe("meeting");
    expect(second.getSnapshot().state.locations.one).toBeNull();

    const restored = new SampleWorkspaceStore(catalog, session("first"), () => storage);
    const offRestore = restored.subscribe(() => { });

    expect(restored.getSnapshot().state).toEqual(first.getSnapshot().state);
    offFirst();
    offSecond();
    offRestore();
  });

  it("SAMPLE-005 blocks expired writes and announces expiry without a new action", () => {
    vi.useFakeTimers();

    const store = new SampleWorkspaceStore(catalog, session("expires"), () => memory());
    const off = store.subscribe(() => { });
    store.dispatch({ type: "select", ids: ["one"] });

    vi.advanceTimersByTime(3600000);
    expect(store.getSnapshot().expired).toBe(true);
    store.dispatch({ type: "propose" });
    expect(store.getSnapshot().state.phase).toBe("select");
    off();
  });

  it("SAMPLE-005 uses server remaining duration despite a device clock offset", () => {
    vi.useFakeTimers();

    const store = new SampleWorkspaceStore(catalog, session("offset"), () => memory(), 60_000);

    vi.setSystemTime(Date.now() + 7 * 3600000);

    const off = store.subscribe(() => { });
    store.dispatch({ type: "select", ids: ["one"] });

    store.dispatch({ type: "propose" });
    expect(store.getSnapshot().state.phase).toBe("review");
    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot().expired).toBe(true);
    off();
  });

  it("SAMPLE-005 preserves in-memory work and reports unavailable persistence", () => {
    const store = new SampleWorkspaceStore(
      catalog,
      session("blocked"),
      () => ({
        getItem: () => "bad-json",
        setItem: () => {
          throw new Error("quota");
        }
      })
    );
    const off = store.subscribe(() => { });
    expect(store.getSnapshot().notice).toContain("처음 상태");
    store.dispatch({ type: "select", ids: ["one"] });
    store.dispatch({ type: "propose" });
    store.dispatch({ type: "apply" });
    expect(store.getSnapshot().state.locations.one).toBe("meeting");
    expect(store.getSnapshot().notice).toContain("임시 보관하지 못했습니다");
    off();
  });
});

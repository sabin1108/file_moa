import { describe, expect, it, vi } from "vitest";
import { classifyConversationRequest, prepareQuestionSelection, reprepareQuestionSources, routeConversationRequest } from "../../../src/features/conversation-workspace/material-work/request-routing";
import { DocumentFindController } from "../../../src/features/local-folders/search/documents/document-find-controller";
import { OrganizationPreparationController } from "../../../src/features/local-folders/organization/organization-preparation-controller";
import type { SourceSnapshot } from "../../../src/features/local-folders/organization/source-snapshot-rules";
import type { SourceListingState } from "../../../src/features/local-folders/browsing/file-list/source-listing-controller";

const snapshot: SourceSnapshot = {
  documents: [{
    id: "memo",
    name: "memo.md",
    path: ["memo.md"],
    excerpt: "성능 보고",
    size: 10,
    lastModified: 42,
    sha256: "a".repeat(64),
    excerptHash: "b".repeat(64)
  }],
  excluded: [],
  complete: true,
  limits: [],
  discoveredFiles: 1,
  directories: 1,
  bytes: 10,
};
const findResult = { documents: [], complete: true, excluded: [], limits: [], discoveredFiles: 0 };

function actions() {
  return {
    organization: { cancel: vi.fn(), reset: vi.fn(), update: vi.fn(), prepare: vi.fn(async () => { }) },
    finding: { start: vi.fn(), reset: vi.fn() },
    preview: { close: vi.fn() },
  };
}

describe("explicit question-source preparation", () => {
  const files: SourceListingState = {
    available: true, phase: "ready", stale: false, issue: null,
    result: { path: ["notes"], entries: [{ kind: "file", name: "evidence.md" }, { kind: "directory", name: "private" }], truncated: false },
    requestedPath: ["notes"], selectedNames: ["evidence.md", "private"], query: "", searchOpen: false, selectionOpen: true,
  };

  it("prepares only the chosen files with the original question and no organization instruction", () => {
    const target = actions();
    expect(prepareQuestionSelection(target, files, "이 자료의 근거를 설명해 주세요", true)).toBe(true);
    expect(target.organization.update).toHaveBeenCalledWith({ purpose: "grounded", request: "이 자료의 근거를 설명해 주세요", scope: { kind: "selected", entries: [{ kind: "file", path: ["notes", "evidence.md"] }] }, basis: "", reference: null, destination: null });
    expect(target.organization.prepare).toHaveBeenCalledOnce();
  });

  it.each([
    [{ ...files, stale: true }, "질문", true],
    [{ ...files, selectedNames: [] }, "질문", true],
    [files, "  ", true],
    [files, "질문", false],
  ] as const)("does not read files when preparation is unavailable", (selection, question, available) => {
    const target = actions();
    expect(prepareQuestionSelection(target, selection, question, available)).toBe(false);
    expect(target.organization.prepare).not.toHaveBeenCalled();
    expect(target.organization.update).not.toHaveBeenCalled();
  });
});

describe("RQ-001/002: local request choice", () => {
  it.each([{ kind: "all" as const }, { kind: "folder" as const, path: ["nested"] }])("requires explicit file selection for an incomplete folder scope (%j)", async scope => {
    const organization = new OrganizationPreparationController(vi.fn(async () => ({ ...snapshot, complete: false })), vi.fn());
    organization.update({ request: "이전 정리", scope, reference: null, destination: null });
    await organization.prepare();
    const before = organization.getSnapshot();
    expect(reprepareQuestionSources({ organization, preview: actions().preview }, "새 질문", true)).toBe(false);
    expect(organization.getSnapshot()).toBe(before);
  });
  it("keeps unresolved selected paths on reread without readding readable files the user deselected", async () => {
    const partial = { ...snapshot, complete: false, documents: [...snapshot.documents, { ...snapshot.documents[0], id: "deselected", path: ["deselected.md"] }], excluded: [{ path: ["missing.md"], reason: "unreadable-file" as const }] };
    const organization = new OrganizationPreparationController(vi.fn(async () => partial), vi.fn());
    organization.update({ purpose: "grounded", request: "이전 질문", scope: { kind: "selected", entries: ["memo.md", "missing.md", "deselected.md"].map(name => ({ kind: "file", path: [name] })) }, reference: null, destination: null });
    await organization.prepare();
    organization.toggleDocument("deselected");
    expect(reprepareQuestionSources({ organization, preview: actions().preview }, "새 질문", true)).toBe(true);
    await vi.waitFor(() => expect(organization.getSnapshot().phase).toBe("ready"));
    expect(organization.getSnapshot()).toMatchObject({ scope: { kind: "selected", entries: [{ kind: "file", path: ["memo.md"] }, { kind: "file", path: ["missing.md"] }] }, partialAccepted: false });
  });
  it("clears a previous question scope before beginning a new organization request", () => {
    const read = vi.fn(async () => snapshot);
    const organization = new OrganizationPreparationController(read, vi.fn());
    organization.update({ purpose: "grounded", request: "예전 질문", scope: { kind: "selected", entries: [{ kind: "file", path: ["old.md"] }] }, reference: null, destination: null });
    routeConversationRequest("새 자료 정리", { organization, finding: actions().finding, preview: actions().preview }, true);
    expect(organization.getSnapshot()).toMatchObject({ purpose: "organize", scope: null, request: "새 자료 정리" });
    expect(read).not.toHaveBeenCalled();
  });

  it("rereads only the previously selected sources for a changed question", async () => {
    const read = vi.fn(async () => snapshot);
    const organization = new OrganizationPreparationController(read, vi.fn());
    organization.update({ purpose: "grounded", request: "이전 질문", scope: { kind: "all" }, reference: null, destination: null });
    await organization.prepare();
    expect(reprepareQuestionSources({ organization, preview: actions().preview }, "새 질문", true)).toBe(true);
    await vi.waitFor(() => expect(organization.getSnapshot().phase).toBe("ready"));
    expect(organization.getSnapshot()).toMatchObject({ purpose: "grounded", submittedRequest: "새 질문", scope: { kind: "selected", entries: [{ kind: "file", path: ["memo.md"] }] }, consentKey: null });
    expect(read).toHaveBeenLastCalledWith({ kind: "selected", entries: [{ kind: "file", path: ["memo.md"] }] }, expect.stringContaining("새 질문"), expect.any(AbortSignal));
  });
  it.each([
    ["10월 회의 자료 찾아줘", "find"], ["회의 자료 검색해줘", "find"], ["회의 자료 찾기", "find"],
    ["작년 자료 말고 올해 회의 자료 찾아줘", "find"],
    ["성능 보고서를 정리해줘", "organize"], ["보고서를 분류해줘", "organize"],
    ["회의 자료를 찾아서 정리해줘", null], ["찾지 말고 정리해줘", null],
    ["정리하지 말고 검색해줘", null], ["회의 자료", null], ["", null],
  ] as const)("classifies %s without a model", (request, expected) => {
    expect(classifyConversationRequest(request)).toBe(expected);
  });

  it("leaves both workflows untouched until an ambiguous request is chosen", () => {
    const target = actions();

    expect(routeConversationRequest("회의 자료 찾아서 정리해줘", target, true)).toBe("choose");

    for (const fn of [...Object.values(target.organization), ...Object.values(target.finding), target.preview.close]) expect(fn).not.toHaveBeenCalled();
  });

  it.each(["find", "organize"] as const)("accepts an explicit %s choice", intent => {
    const target = actions();

    expect(routeConversationRequest("회의 자료 찾아서 정리해줘", target, true, intent)).toBe(intent);
    expect(target.organization.cancel).toHaveBeenCalledOnce();

    if (intent === "find") {
      expect(target.finding.start).toHaveBeenCalledWith("회의 자료 찾아서 정리해줘");
      expect(target.organization.prepare).not.toHaveBeenCalled();
    } else {
      expect(target.finding.reset).toHaveBeenCalledOnce();
      expect(target.organization.update).toHaveBeenCalledWith({ request: "회의 자료 찾아서 정리해줘" });
      expect(target.organization.prepare).toHaveBeenCalledOnce();
    }
  });

  it.each([undefined, "find", "organize"] as const)("blocks unavailable connections and active file applications (%s)", intent => {
    const target = actions();

    expect(routeConversationRequest("회의 자료 찾아서 정리해줘", target, false, intent)).toBe("blocked");
    expect(routeConversationRequest("  ", target, true, intent)).toBe("blocked");

    for (const fn of [...Object.values(target.organization), ...Object.values(target.finding), target.preview.close]) expect(fn).not.toHaveBeenCalled();
  });
});

describe("RQ-003: reuse existing cancellation and consent boundaries", () => {
  it("revokes prepared transfer consent before moving to search without sending", async () => {
    const read = vi.fn(async () => snapshot);
    const organization = new OrganizationPreparationController(read, vi.fn());
    const finding = new DocumentFindController(vi.fn(async () => findResult), undefined, () => 2026);

    organization.update({ request: "성능 보고", scope: { kind: "all" } });
    await organization.prepare();
    organization.consent(true);
    expect(organization.getSnapshot().consentKey).toBeTruthy();

    const send = vi.spyOn(organization, "send");

    routeConversationRequest("회의 자료 찾아줘", { organization, finding, preview: { close: vi.fn() } }, true);
    expect(organization.getSnapshot()).toMatchObject({ consentKey: null, snapshot: null, result: null });
    expect(finding.getSnapshot().phase).toBe("confirm");
    expect(read).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the original request but excludes an organization command from chosen search terms", () => {
    const read = vi.fn(async () => findResult);
    const finding = new DocumentFindController(read, undefined, () => 2026);
    const organization = new OrganizationPreparationController(vi.fn(async () => snapshot), vi.fn());

    for (const [request, terms] of [["회의 자료를 찾아서 정리해줘", "회의"], ["정리 방법 자료 찾아줘", "정리 방법"]]) {
      routeConversationRequest(
        request,
        { finding, organization, preview: { close: vi.fn() } },
        true,
        "find"
      );
      expect(finding.getSnapshot().request).toBe(request);
      expect(finding.getSnapshot().filters.terms).toBe(terms);
    }

    expect(read).not.toHaveBeenCalled();
  });

  it("ignores a late search after switching to organization", async () => {
    let finish!: (value: typeof findResult) => void;
    const finding = new DocumentFindController(() => new Promise(resolve => {
      finish = resolve;
    }), undefined, () => 2026);

    finding.start("회의 자료 찾아줘");
    finding.configure({ terms: "회의", month: "all", basis: "body" });

    const pending = finding.search();
    const organization = new OrganizationPreparationController(vi.fn(async () => snapshot), vi.fn());

    routeConversationRequest("성능 보고 정리해줘", { organization, finding, preview: { close: vi.fn() } }, true);
    finish(findResult);
    await pending;
    expect(finding.getSnapshot()).toMatchObject({ phase: "idle", result: null });
    expect(organization.getSnapshot().request).toBe("성능 보고 정리해줘");
  });

  it("ignores a late preparation after switching to search", async () => {
    let finish!: (value: SourceSnapshot) => void;
    const organization = new OrganizationPreparationController(() => new Promise(resolve => {
      finish = resolve;
    }), vi.fn());
    const finding = new DocumentFindController(vi.fn(async () => findResult), undefined, () => 2026);

    organization.update({ request: "성능 보고", scope: { kind: "all" } });

    const pending = organization.prepare();

    routeConversationRequest("회의 자료 찾아줘", { organization, finding, preview: { close: vi.fn() } }, true);
    finish(snapshot);
    await pending;
    expect(organization.getSnapshot()).toMatchObject({ phase: "draft", consentKey: null, snapshot: null, result: null });
    expect(finding.getSnapshot().phase).toBe("confirm");
  });
});

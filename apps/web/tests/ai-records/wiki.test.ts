import { describe, expect, it } from "vitest";
import { aiRecordPayloadSchema } from "../../src/shared/ai-records";
import { makeWikiDraft, proposeWikiUpdate, acceptWikiUpdate } from "../../src/features/ai-records/lib/wiki";
import { checkWikiSources } from "../../src/features/ai-records/services/wiki-sources";
import { encodeRecord, decodeRecord } from "../../src/features/ai-records/lib/record-codec";
import type { LocalRecord } from "@personal-ai/domain";

const evidence = { owner: { userId: "owner", workspaceId: "workspace" }, connectionId: "source-a", citations: [{ path: ["note.md"], sha256: "a".repeat(64), size: 80, quote: "검증 가능한 합성 자료의 인용문입니다." }] };
const input = () => ({ id: "wiki-one", title: "주제 위키", markdown: "자료에서 만든 요약", evidence, model: "fixture", sourceConversationId: "chat-one", now: "2026-11-10T03:00:00.000Z" });

describe("source-linked wiki records", () => {
  it("round trips a source-linked draft through the existing artifact revision contract", () => {
    const draft = makeWikiDraft(input());
    expect(draft.type).toBe("artifact");
    expect(draft.wiki.generationVersion).toBe(1);
    expect(draft.wiki.evidence).toEqual(evidence);
    const metadata: LocalRecord = { schemaVersion: 1, recordId: draft.id, revisionId: "rev-one", parentRevisionId: null, kind: "artifact", scope: { type: "global" }, state: "draft", createdAt: draft.updatedAt, contentFile: "rev-one.md", contentSha256: "a".repeat(64) };
    expect(decodeRecord(encodeRecord(draft), metadata)).toEqual(draft);
  });

  it("rejects missing sources and injected metadata without changing ordinary artifacts", () => {
    expect(() => makeWikiDraft({ ...input(), evidence: { ...evidence, citations: [] } })).toThrow();
    const draft = makeWikiDraft(input());
    expect(aiRecordPayloadSchema.safeParse({ ...draft, wiki: { ...draft.wiki, token: "secret" } }).success).toBe(false);
    const { wiki: _wiki, ...artifact } = draft;
    expect(_wiki.version).toBe(1);
    expect(aiRecordPayloadSchema.parse(artifact)).toEqual(artifact);
  });

  it("preserves user text until the newly generated proposal is explicitly accepted", () => {
    const edited = { ...makeWikiDraft(input()), markdown: "사용자가 고친 본문" };
    const proposed = proposeWikiUpdate(edited, { ...input(), sourceConversationId: "chat-two", markdown: "새 자료의 요약", now: "2026-11-10T04:00:00.000Z" });
    expect(proposed.markdown).toBe(edited.markdown);
    expect(proposed.wiki.generatedMarkdown).toBe("자료에서 만든 요약");
    const accepted = acceptWikiUpdate(proposed);
    expect(accepted.markdown).toBe("새 자료의 요약");
    expect(accepted.wiki.generationVersion).toBe(2);
    expect(accepted.wiki.proposal).toBeUndefined();
    expect(accepted.wiki.sourceConversationIds).toEqual(["chat-one", "chat-two"]);
    expect(edited.markdown).toBe("사용자가 고친 본문");
  });

  it("distinguishes changed sources, missing permission, and a different owner before reading", async () => {
    const signal = new AbortController().signal;
    const current = { owner: evidence.owner, connectionId: evidence.connectionId };
    expect(await checkWikiSources(evidence, current, async () => {}, signal)).toBe("current");
    expect(await checkWikiSources(evidence, current, async () => { throw Error("citation-changed"); }, signal)).toBe("needs-update");
    expect(await checkWikiSources(evidence, current, async () => { throw new DOMException("denied", "NotAllowedError"); }, signal)).toBe("unavailable");
    let reads = 0;
    expect(await checkWikiSources(evidence, { ...current, connectionId: "other" }, async () => { reads++; }, signal)).toBe("wrong-connection");
    expect(reads).toBe(0);
  });

  it("never publishes a source check that completed after cancellation", async () => {
    const operation = new AbortController();
    const check = checkWikiSources(evidence, { owner: evidence.owner, connectionId: evidence.connectionId }, async () => { operation.abort(); }, operation.signal);
    await expect(check).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reads repeated citations once while checking a different proposal snapshot", async () => {
    const repeated = { ...evidence, citations: [...evidence.citations, { ...evidence.citations[0], quote: "같은 파일의 다른 인용입니다." }] };
    const reads: unknown[] = [];
    expect(await checkWikiSources(repeated, { owner: evidence.owner, connectionId: evidence.connectionId }, async source => { reads.push(source); }, new AbortController().signal)).toBe("current");
    expect(reads).toHaveLength(1);
    const proposed = proposeWikiUpdate(makeWikiDraft(input()), { ...input(), evidence: { ...evidence, citations: [{ ...evidence.citations[0], sha256: "b".repeat(64) }] } });
    await checkWikiSources(proposed.wiki.proposal!.evidence, { owner: evidence.owner, connectionId: evidence.connectionId }, async source => { expect(source.sha256).toBe("b".repeat(64)); }, new AbortController().signal);
  });
});

import { expect, it } from "vitest";
import { encodeRecord, decodeRecord } from "../../../src/features/ai-records/storage/record-codec";
import type { LocalRecord } from "@personal-ai/domain";

it("keeps readable Markdown while round-tripping strictly validated state and approval", () => {
  const payload = {
    type: "memory" as const,
    id: "memory-a",
    title: "선호",
    content: "간결하게 <!-- 끝 --> 작성",
    status: "proposed" as const,
    scope: { type: "global" as const },
    sourceConversationId: null,
    updatedAt: "2026-11-09T03:00:00.000Z"
  };
  const metadata: LocalRecord = {
    schemaVersion: 1,
    recordId: payload.id,
    revisionId: "rev-a",
    parentRevisionId: null,
    kind: "memory",
    scope: { type: "global" },
    state: "proposed",
    createdAt: payload.updatedAt,
    contentFile: "rev-a.md",
    contentSha256: "a".repeat(64)
  };
  const body = encodeRecord(payload);

  expect(body.startsWith("# 선호\n\n간결하게")).toBe(true);
  expect(decodeRecord(body, metadata)).toEqual(payload);
  expect(() => decodeRecord(body, { ...metadata, state: "approved" })).toThrow("record-payload-mismatch");
});

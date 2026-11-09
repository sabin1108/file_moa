import { expect, it } from "vitest";
import { validateGroundedAnswer, groundedRequestSchema } from "../../src/shared/grounded-chat";
const document = { id: "document-1", name: "notes.md", path: ["notes.md"], excerpt: "검증한 실제 자료의 문장을 참고합니다.", excerptHash: "a".repeat(64), sha256: "b".repeat(64), size: 100, lastModified: 0 };
it("rejects unknown and fabricated quotes", () => {
  expect(validateGroundedAnswer({ answer: "답변", citations: [{ documentId: document.id, quote: "검증한 실제 자료의 문장" }] }, [document]).citations).toHaveLength(1);
  expect(() => validateGroundedAnswer({ answer: "답변", citations: [{ documentId: "document-2", quote: "검증한 실제 자료의 문장" }] }, [document])).toThrow();
  expect(() => validateGroundedAnswer({ answer: "답변", citations: [{ documentId: document.id, quote: "근거에 존재하지 않는 문장" }] }, [document])).toThrow();
});
it("rejects duplicate paths and explicit consent omission", () => {
  const input = { requestId: `${Date.now()}:${crypto.randomUUID()}`, owner: { userId: "a", workspaceId: "w" }, consent: true, question: "요약", documents: [document] };
  expect(groundedRequestSchema.safeParse(input).success).toBe(true);
  expect(groundedRequestSchema.safeParse({ ...input, documents: [document, { ...document, id: "document-2" }] }).success).toBe(false);
  expect(groundedRequestSchema.safeParse({ ...input, consent: false }).success).toBe(false);
});

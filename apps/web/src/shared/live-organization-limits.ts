import { DOCUMENT_LIMITS } from "@personal-ai/domain";

export const LIVE_ORGANIZATION_LIMITS = {
  documents: DOCUMENT_LIMITS.workspaceDocuments,
  excerptCharacters: 50_000,
  referenceDirectories: 1000,
  payloadBytes: 512_000,
  batchDocuments: 20,
  batchCharacters: 10_000,
  inputTokens: 24_000,
  outputTokens: 8192,
  timeoutMs: 120_000,
} as const;

export function organizationSelectionIssue(documents: readonly { excerpt: string }[]) {
  if (documents.length > LIVE_ORGANIZATION_LIMITS.documents) return `한 번에 ${LIVE_ORGANIZATION_LIMITS.documents}개까지 분석할 수 있어요. 자료를 나눠 선택해 주세요.`;
  if (documents.reduce((sum, document) => sum + document.excerpt.length, 0) > LIVE_ORGANIZATION_LIMITS.excerptCharacters) return "선택한 발췌가 50,000자를 넘어요. 이번에 분석할 자료를 줄여 주세요.";
  return null;
}

export function organizationBatches<T extends { excerpt: string }>(documents: readonly T[]): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  let characters = 0;
  for (const document of documents) {
    if (batch.length && (batch.length === LIVE_ORGANIZATION_LIMITS.batchDocuments || characters + document.excerpt.length > LIVE_ORGANIZATION_LIMITS.batchCharacters)) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(document);
    characters += document.excerpt.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

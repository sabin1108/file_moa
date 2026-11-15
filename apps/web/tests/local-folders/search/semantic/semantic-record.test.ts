import { expect, it } from "vitest";
import { isSemanticRecord, isSemanticVector, semanticRecordId, semanticSimilarity } from "../../../../src/features/local-folders/search/semantic/semantic-record";
import { SEMANTIC_MODEL } from "../../../../src/features/local-folders/search/semantic/model-assets";

it("SEM-03/05 validates normalized finite vectors and contiguous bounded source offsets", () => {
  const vector = new Float32Array(384); vector[0] = 1;
  const value = { owner: "a", workspace: "w", connection: "c", path: ["note.md"], pathKey: '["note.md"]', hash: "a".repeat(64), parserVersion: 2, model: SEMANTIC_MODEL.version };
  const row = { ...value, id: semanticRecordId(value), epoch: { scope: "scope", model: "model" }, textLength: 8, complete: true, chunks: [{ start: 0, end: 8, vector }], updatedAt: 1 };
  expect(isSemanticRecord(row)).toBe(true);
  expect(isSemanticRecord({ ...row, hash: "b".repeat(64) })).toBe(false);
  expect(isSemanticRecord({ ...row, chunks: [{ start: 1, end: 8, vector }] })).toBe(false);
  expect(isSemanticRecord({ ...row, textLength: 9 })).toBe(false);
  expect(isSemanticRecord({ ...row, textLength: 9, complete: false })).toBe(true);
  expect(semanticSimilarity(vector, vector)).toBe(1);
  const invalid = vector.slice(); invalid[1] = NaN;
  expect(isSemanticVector(invalid)).toBe(false);
  expect(isSemanticVector(new Float32Array(384))).toBe(false);
});

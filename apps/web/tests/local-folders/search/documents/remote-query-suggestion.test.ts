import { expect, it } from "vitest";
import { inferFindRequest } from "../../../../src/features/local-folders/search/documents/document-find";
import { applySearchQuerySuggestion } from "../../../../src/features/local-folders/search/documents/remote-query-suggestion";
import { compileSearchQuerySuggestion } from "../../../../src/shared/search-query";

it("RAG-S02 refuses a model plan that removes an existing mandatory target", () => {
  const question = "가온센터 이력서 찾아줘";
  const suggestion = compileSearchQuerySuggestion({ required: ["이력서"], preferred: [], phrases: [], excluded: [] }, question);

  expect(() => applySearchQuerySuggestion(question, suggestion, inferFindRequest(question))).toThrow("query-confirmed-target");
});

it("keeps a quoted single-token phrase when a model classifies it as required", () => {
  const question = '"ERR_AUTH" 로그 찾아줘';
  const suggestion = compileSearchQuerySuggestion({ required: ["ERR_AUTH", "로그"], preferred: [], phrases: [], excluded: [] }, question);

  expect(applySearchQuerySuggestion(question, suggestion, inferFindRequest(question)).terms).toBe('"ERR_AUTH" 로그');
});

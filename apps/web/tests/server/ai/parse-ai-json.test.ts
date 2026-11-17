import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseAiJson } from "../../../src/server/ai/parse-ai-json";

it("preserves a complete single object with quoted braces and discards trailing presentation text", () => {
  const value = { evidence: '문장 { 안의 "표시" }와 \\ 경로', matches: [] };
  expect(parseAiJson(`${JSON.stringify(value)}\n\nprovidername`)).toEqual(value);
  expect(parseAiJson(`${JSON.stringify(value)}}\nassistant output complete`)).toEqual(value);
  expect(parseAiJson(`${JSON.stringify(value)}"}`)).toEqual(value);
  expect(parseAiJson(`\`\`\`json\n${JSON.stringify(value)}\n\`\`\``)).toEqual(value);
  expect(parseAiJson(JSON.stringify(value))).toEqual(value);
});
it.each(['{"matches":[', '{"quote":"끝나지 않음}', '{"matches":[]} {"matches":[1]}', '{"matches":[]} [1]', '{"matches":[]} 42', '{"matches":[]} null', '설명 {"matches":[]}', '{"matches":[],}'])('rejects truncated, invalid or ambiguous objects: %s', value => {
  expect(() => parseAiJson(value)).toThrow();
});

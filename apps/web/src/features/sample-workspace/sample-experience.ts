import type { SampleCatalog } from "../../shared/sample-contract";
import { confirmFindQuery, findTextEvidence, inferFindRequest } from "../local-folders/search/documents/document-find";
import { sampleFolderPath, sampleActiveCatalog, type SampleState } from "./sample-state";

export function prepareSampleReply(catalog: SampleCatalog, state: SampleState, input: {
  mode: "chat" | "find" | "grounded";
  question: string;
  selectedIds: readonly string[];
  referenceYear: number;
}) {
  const question = input.question.trim();
  if (!question || question.length > 800 || input.selectedIds.length > 200
    || new Set(input.selectedIds).size !== input.selectedIds.length
    || input.selectedIds.some(id => !catalog.documents.some(document => document.id === id))) throw Error("invalid-sample-question");
  const documents = catalog.documents.filter(document => input.selectedIds.includes(document.id));
  if (input.mode === "chat") return {
    answer: "준비된 대화 예시입니다. 실제 AI를 호출하지 않았어요.\n\n보고서는 결론 → 근거 → 다음 행동 순서로 작성하고, 수치에는 기간과 비교 기준을 붙여 보세요. 자유 질문에 맞춘 생성 답변은 정식 서비스에서 제공해요.",
    findings: [], citations: [],
  };
  if (input.mode === "find") {
    const filters = inferFindRequest(question, input.referenceYear);
    const query = confirmFindQuery(filters, false, input.referenceYear);
    const active = sampleActiveCatalog(catalog, state);
    const matches = documents.filter(document => findTextEvidence(document.excerpt, query, undefined, {
      name: document.name, path: [...sampleFolderPath(active, state.locations[document.id]), document.name],
    })?.kind === "matched");
    return {
      answer: `샘플 발췌 ${documents.length}개에서 기존 검색 규칙으로 ${matches.length}개를 찾았어요. 실제 AI를 호출하지 않았어요.\n${matches.map(document => `• ${document.name}`).join("\n")}${matches.length ? "\n검색 결과를 열어 발췌와 경로를 확인하세요." : "\n다른 단어나 범위로 다시 찾아보세요."}`,
      findings: matches.map(document => document.id), citations: [],
    };
  }
  if (!documents.length) throw Error("sample-sources-required");
  const excerpts = documents.slice(0, 5);
  return {
    answer: `선택한 자료의 발췌를 모아 보여주는 체험입니다. 질문에 대한 생성·추론 답변이 아니며, 발췌에 없는 사실은 확인할 수 없어요.\n\n${excerpts.map((document, index) => `[${index + 1}] ${document.name}\n${document.excerpt.slice(0, 180)}`).join("\n\n")}`.slice(0, 1500),
    findings: [], citations: excerpts.map(document => document.id),
  };
}

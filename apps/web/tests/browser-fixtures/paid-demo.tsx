import { createRoot } from "react-dom/client";
import { NavigationGuardProvider } from "../../src/components/navigation/NavigationGuard";
import { WorkspaceTour } from "../../src/features/onboarding/WorkspaceTour";
import { SampleConversation } from "../../src/features/sample-workspace/conversation/SampleConversation";
import { SampleWorkspaceStore } from "../../src/features/sample-workspace/sample-workspace-store";
import type { SampleAnswerAction, SampleAnswerRequest, SampleAnswerResult } from "../../src/shared/sample-answer";
import type { SampleOrganizationAction } from "../../src/shared/sample-organization";
import type { SampleAiErrorCode } from "../../src/shared/sample-ai";
import type { SampleCatalog } from "../../src/shared/sample-contract";
import "../../src/styles/globals.css";

const catalog: SampleCatalog = {
  version: "1", folders: [{ id: "work", label: "업무" }, { id: "web", label: "받은 자료/개발/웹사이트 문서" }],
  documents: Array.from({ length: 42 }, (_, index) => ({ id: `doc-${index + 1}`, name: `회의자료-${index + 1}.md`, format: "md" as const,
    ...(index < 2 ? { sourceFolderId: "web" } : {}), excerpt: `합성 회의 자료 ${index + 1}입니다. 다음 작업과 일정을 검토했습니다.`, proposal: { folderId: "work", reason: "회의", reviewRequired: false } })),
};
const store = new SampleWorkspaceStore(catalog, { kind: "sample", id: "paid-browser-fixture", expiresAt: Date.now() + 3600000, version: "1" });
const control = { store, answers: [] as SampleAnswerRequest[], organizations: 0, organizationInputs: [] as Parameters<SampleOrganizationAction>[0][], review: false, malformedOrganization: false, hold: false, failure: null as SampleAiErrorCode | null, resolve: [] as (() => void)[] };
const usage = { inputTokens: 10, outputTokens: 10, totalTokens: 20 };
const answer: SampleAnswerAction = async input => {
  control.answers.push(input);
  const selected = catalog.documents.find(document => document.id === input.documentIds[0]);
  const result: SampleAnswerResult = control.failure ? { ok: false, code: control.failure } : { ok: true,
    answer: { answer: `합성 API 응답: ${input.messages.at(-1)!.content}`, citations: selected ? [{ documentId: selected.id, quote: selected.excerpt.slice(0, 20) }] : [] }, model: "gpt-6-luna", usage };
  if (control.hold) return new Promise(resolve => control.resolve.push(() => resolve(result)));
  return result;
};
const organize: SampleOrganizationAction = async input => {
  control.organizations++;
  control.organizationInputs.push(input);
  if (control.malformedOrganization) return { ok: false, code: "unavailable", reason: "invalid-json", questions: input.documentIds.map(documentId => ({
    id: `${documentId}:destination`, documentId, kind: "destination", reason: "분류를 확인해 주세요", dates: [],
  })) };
  const reviewing = control.review && !input.context?.answers.length;
  const result = { ok: true as const, organization: { summary: "합성 API 정리 제안입니다.", matches: reviewing ? [] : input.documentIds.filter(id => !input.context?.answers.some(answer => answer.documentId === id && answer.exclude)).map(id => ({ documentId: id,
    destination: input.context?.answers.find(answer => answer.documentId === id)?.destination ?? (/중요도/u.test(input.instruction) ? ["상"] : ["정리한 회의"]),
    evidence: catalog.documents.find(document => document.id === id)!.excerpt.slice(0, 20), date: null })), held: reviewing ? input.documentIds.map(documentId => ({ documentId, reason: "목적지를 확인해 주세요" })) : [] },
    questions: reviewing ? input.documentIds.map(documentId => ({ id: `${documentId}-destination`, documentId, kind: "destination" as const, reason: "목적지를 확인해 주세요", dates: [] })) : [], model: "gpt-6-luna", usage };
  if (control.hold) return new Promise(resolve => control.resolve.push(() => resolve(result)));
  return result;
};
Object.assign(window, { paidDemo: control });
window.addEventListener("fixture-navigation", event => {
  const { href, replace } = (event as CustomEvent<{ href: string; replace: boolean }>).detail;
  history[replace ? "replaceState" : "pushState"](null, "", href);
});
const neverAutomatic = async () => false;
createRoot(document.getElementById("fixture")!).render(<NavigationGuardProvider>
  <WorkspaceTour mode="sample" claim={neverAutomatic}>
    <SampleConversation catalog={catalog} store={store} aiProvider="openai" answerAction={answer} organizeAction={organize} />
  </WorkspaceTour>
</NavigationGuardProvider>);

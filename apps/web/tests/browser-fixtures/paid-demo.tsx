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
  version: "1", folders: [{ id: "work", label: "업무" }],
  documents: Array.from({ length: 42 }, (_, index) => ({ id: `doc-${index + 1}`, name: `회의자료-${index + 1}.md`, format: "md" as const,
    excerpt: `합성 회의 자료 ${index + 1}입니다. 다음 작업과 일정을 검토했습니다.`, proposal: { folderId: "work", reason: "회의", reviewRequired: false } })),
};
const store = new SampleWorkspaceStore(catalog, { kind: "sample", id: "paid-browser-fixture", expiresAt: Date.now() + 3600000, version: "1" });
const control = { store, answers: [] as SampleAnswerRequest[], organizations: 0, hold: false, failure: null as SampleAiErrorCode | null, resolve: [] as (() => void)[] };
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
  return { ok: true, organization: { summary: "합성 API 정리 제안입니다.", matches: input.documentIds.map(id => ({ documentId: id, destination: ["정리한 회의"], evidence: catalog.documents.find(document => document.id === id)!.excerpt.slice(0, 20), date: null })), held: [] }, model: "gpt-6-luna", usage };
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

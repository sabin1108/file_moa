import { isFindRequest } from "../../local-folders/lib/document-find";
import type { DocumentFindController } from "../../local-folders/store/document-find-controller";
import type { OrganizationPreparationController } from "../../local-folders/store/organization-preparation-controller";

export type ConversationRequestIntent = "find" | "organize";

type RequestActions = {
  finding: Pick<DocumentFindController, "start" | "reset">;
  organization: Pick<OrganizationPreparationController, "cancel" | "update" | "prepare">;
  preview: { close: () => void };
};

export function classifyConversationRequest(request: string): ConversationRequestIntent | null {
  if (/찾지|검색하지|정리하지|분류하지|이동하지|복사하지/u.test(request)) return null;
  if (isFindRequest(request)) return "find";
  if (/찾아|찾기|검색/u.test(request)) return null;
  return /정리|모아|모으|분류|이동|복사/u.test(request) ? "organize" : null;
}

export function routeConversationRequest(
  request: string,
  actions: RequestActions,
  canStart: boolean,
  choice?: ConversationRequestIntent,
): ConversationRequestIntent | "choose" | "blocked" {
  const text = request.trim();
  if (!canStart || !text) return "blocked";
  const intent = choice ?? classifyConversationRequest(text);
  if (!intent) return "choose";

  actions.preview.close();
  actions.organization.cancel();
  if (intent === "find") actions.finding.start(text);
  else {
    actions.finding.reset();
    actions.organization.update({ request: text });
    void actions.organization.prepare();
  }
  return intent;
}

export function prepareFoundDocuments(
  actions: Omit<RequestActions, "finding"> & { finding: Pick<DocumentFindController, "getSnapshot" | "reset"> },
  canStart: boolean,
): boolean {
  const state = actions.finding.getSnapshot();
  if (!canStart || state.phase !== "ready" || !state.result || !state.selectedPaths.length) return false;
  const paths = state.selectedPaths.filter(path => state.result!.documents.some(document => JSON.stringify(document.path) === JSON.stringify(path)));
  if (paths.length !== state.selectedPaths.length) return false;
  actions.preview.close();
  actions.organization.cancel();
  actions.organization.update({
    request: `${state.filters.terms} 자료 정리`,
    scope: { kind: "selected", entries: paths.map(path => ({ kind: "file", path })) },
    basis: "", reference: null, destination: null,
  });
  actions.finding.reset();
  void actions.organization.prepare();
  return true;
}

import { isFindRequest } from "../../local-folders/search/documents/document-find";
import type { DocumentFindController } from "../../local-folders/search/documents/document-find-controller";
import type { OrganizationPreparationController } from "../../local-folders/organization/organization-preparation-controller";
import type { SourceListingState } from "../../local-folders/browsing/file-list/source-listing-controller";

export type ConversationRequestIntent = "find" | "organize";

type RequestActions = {
  finding: Pick<DocumentFindController, "start" | "reset">;
  organization: Pick<OrganizationPreparationController, "cancel" | "reset" | "update" | "prepare">;
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
    actions.organization.reset();
    actions.organization.update({ request: text });
    void actions.organization.prepare();
  }

  return intent;
}

export function prepareFoundDocuments(
  actions: Omit<RequestActions, "finding"> & { finding: Pick<DocumentFindController, "getSnapshot" | "reset"> },
  canStart: boolean,
  question?: string,
): boolean {
  const state = actions.finding.getSnapshot();

  if (!canStart || state.phase !== "ready" || !state.result || !state.selectedPaths.length) return false;

  const paths = state.selectedPaths.filter(path => state.result!.documents.some(document => document.contentAvailable !== false && JSON.stringify(document.path) === JSON.stringify(path)));

  if (paths.length !== state.selectedPaths.length) return false;

  if (question !== undefined && !question.trim()) return false;

  preparePaths(actions, paths, question?.trim() ?? `${state.filters.terms} 자료 정리`, question === undefined ? "organize" : "grounded");
  actions.finding.reset();

  return true;
}

function preparePaths(actions: Pick<RequestActions, "organization" | "preview">, paths: readonly (readonly string[])[], request: string, purpose: "organize" | "grounded") {
  actions.preview.close();
  actions.organization.reset();
  actions.organization.update({ purpose, request, scope: { kind: "selected", entries: paths.map(path => ({ kind: "file", path })) }, basis: "", reference: null, destination: null });
  void actions.organization.prepare();
}

export function prepareQuestionSelection(actions: Pick<RequestActions, "organization" | "preview">, files: SourceListingState, question: string, canStart: boolean) {
  if (!canStart || !question.trim() || !files.available || files.phase !== "ready" || files.stale || !files.result) return false;

  const paths = files.result.entries.filter(entry => entry.kind === "file" && files.selectedNames.includes(entry.name)).map(entry => [...files.result!.path, entry.name]);

  if (!paths.length) return false;

  preparePaths(actions, paths, question.trim(), "grounded");

  return true;
}

export function reprepareQuestionSources(actions: { organization: RequestActions["organization"] & Pick<OrganizationPreparationController, "getSnapshot">; preview: RequestActions["preview"] }, question: string, canStart: boolean) {
  const state = actions.organization.getSnapshot();

  if (!state.snapshot || (!state.snapshot.complete && state.scope?.kind !== "selected")) return false;

  const documents = state.snapshot?.documents ?? [];
  const selected = documents.filter(document => state.selectedIds.includes(document.id)).map(document => document.path);
  const unresolved = state.scope?.kind === "selected"
    ? state.scope.entries.filter(entry => entry.kind === "file" && !documents.some(document => JSON.stringify(document.path) === JSON.stringify(entry.path))).map(entry => entry.path)
    : [];
  const paths = [...selected, ...unresolved];

  if (!canStart || !question.trim() || !paths.length) return false;

  preparePaths(actions, paths, question.trim(), "grounded");

  return true;
}

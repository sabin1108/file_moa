"use client";

import { useState, useSyncExternalStore } from "react";
import type { useSharedSourceFolderConnection } from "../../local-folders/SourceFolderProvider";
import { prepareFoundDocuments, routeConversationRequest, type ConversationRequestIntent } from "./request-routing";

export function useConversationRequests(connection: ReturnType<typeof useSharedSourceFolderConnection>, draft: string) {
  const { organization, finding, preview, organizationExecution } = connection;
  const managed = useSyncExternalStore(
    organizationExecution.managed.subscribe,
    organizationExecution.managed.getSnapshot,
    organizationExecution.managed.getServerSnapshot,
  );
  const [pendingRequest, setPendingRequest] = useState<string | null>(null);
  const connected = connection.state.view?.status === "connected";
  const canStart = connected && managed.phase !== "running";
  const focusComposer = () => requestAnimationFrame(() => document.getElementById("message-draft")?.focus());

  const submitRequest = (request: string, choice?: ConversationRequestIntent) => {
    const available = connected && organizationExecution.managed.getSnapshot().phase !== "running";

    if (available && !choice && finding.getSnapshot().phase !== "idle" && !/찾|검색|정리|분류|이동|복사|모아/u.test(request)
      && finding.submitReply(request)) {
      setPendingRequest(null);
      preview.close();

      return;
    }

    const outcome = routeConversationRequest(request, { finding, organization, preview }, available, choice);

    if (outcome === "blocked") return;

    setPendingRequest(outcome === "choose" ? request : null);

    if (outcome === "find") {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-document-find] summary")?.focus());
    } else if (outcome === "organize") focusComposer();
  };

  return {
    canStart,
    pendingRequest: connected && pendingRequest === draft ? pendingRequest : null,
    submitRequest,
    prepareFound() {
      if (prepareFoundDocuments(
        { finding, organization, preview },
        connected && organizationExecution.managed.getSnapshot().phase !== "running"
      )) {
        setPendingRequest(null);
        focusComposer();
      }
    },
    updateOrganizationDraft(request: string) {
      setPendingRequest(null);
      organization.update({ request });
    },
    updateFindDraft(request: string) {
      setPendingRequest(null);
      finding.updateDraft(request);
    },
    cancelChoice() {
      setPendingRequest(null);
      focusComposer();
    },
    returnToOrganization() {
      if (organizationExecution.managed.getSnapshot().phase === "running") return;

      setPendingRequest(null);
      preview.close();
      organization.cancel();
      finding.reset();
      focusComposer();
    },
  };
}

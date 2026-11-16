"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSharedSourceFolderConnection } from "../../local-folders/SourceFolderProvider";
import { prepareFoundDocuments, prepareQuestionSelection, reprepareQuestionSources } from "./request-routing";
import { canContinueWorkspaceTask, classifyWorkspaceRequest, type WorkspaceRequestKind } from "./workspace-request";
import type { GroundedAction } from "../../../shared/grounded-chat";
import { AI_RECORD_LIMITS } from "../../../shared/ai-records";
import type { useGeneralChat } from "../messaging/useGeneralChat";
import { useConversationRequests } from "./useConversationRequests";
import { useGroundedConversation } from "../grounded/useGroundedConversation";
import { parseFindReply } from "../../local-folders/search/documents/document-find-reply";
import { subscribeAuthScopeRevoked } from "../../../shared/auth-session-events";
import { parseOrganizationReply } from "../../local-folders/organization/organization-reply";
import { useConversationStore } from "../ConversationStateProvider";

type Task = {
  id: string;
  kind: "find" | "organize" | "grounded";
  request: string;
  waitingForSource: boolean
};

export function useWorkspaceConversation(chat: ReturnType<typeof useGeneralChat>, groundedAction?: GroundedAction) {
  const local = useSharedSourceFolderConnection();
  const store = useConversationStore();
  const { mode } = useSyncExternalStore(store.subscribe, store.getSelection, store.getServerSelection);
  const finding = useSyncExternalStore(
    local.finding.subscribe,
    local.finding.getSnapshot,
    local.finding.getServerSnapshot
  );
  const organization = useSyncExternalStore(
    local.organization.subscribe,
    local.organization.getSnapshot,
    local.organization.getServerSnapshot
  );
  const managed = useSyncExternalStore(
    local.organizationExecution.managed.subscribe,
    local.organizationExecution.managed.getSnapshot,
    local.organizationExecution.managed.getServerSnapshot
  );
  const requests = useConversationRequests(local, chat.state.draft);
  const grounded = useGroundedConversation(chat.state.draft, groundedAction);
  const cancelGrounded = grounded.cancel;
  const resetGrounded = grounded.reset;
  const isGroundedSending = grounded.isSending;
  const getChatSnapshot = chat.getSnapshot;
  const [task, setTask] = useState<Task | null>(() => {
    const previous = [...chat.state.turns].reverse().find(turn => turn.kind && turn.kind !== "chat");

    if (previous?.kind === "grounded" && grounded.result?.taskId === previous.id) return { id: previous.id, kind: "grounded", request: previous.question, waitingForSource: false };

    if (!previous || (previous.kind !== "find" && previous.kind !== "organize")
      || (previous.kind === "find" ? finding.phase === "idle" : organization.phase === "draft")) return null;

    return { id: previous.id, kind: previous.kind, request: previous.question, waitingForSource: false };
  });
  const [choice, setChoice] = useState<string | null>(null);
  const [groundedRequest, setGroundedRequest] = useState<string | null>(null);
  const submitting = useRef<symbol | null>(null);
  const connected = local.state.view?.status === "connected";
  const reading = finding.phase === "searching" || ["reading", "checking", "sending"].includes(organization.phase);
  const pending = !!chat.state.active || reading || grounded.pending;
  const blocked = pending || managed.phase === "running";
  const intent = mode ?? (groundedRequest === chat.state.draft
    ? "grounded"
    : classifyWorkspaceRequest(chat.state.draft, grounded.documents.length > 0));

  useEffect(() => {
    const revoke = () => {
      submitting.current = null;
      cancelGrounded();
      setTask(null);
      setChoice(null);
      store.select({ mode: null });
      setGroundedRequest(null);
    };

    return subscribeAuthScopeRevoked(revoke);
  }, [cancelGrounded, store]);

  const assertCanChange = useCallback(() => {
    if (local.organizationExecution.managed.getSnapshot().phase === "running") throw new Error("managed-operation-running");

    if (getChatSnapshot().active || local.finding.getSnapshot().phase === "searching"
      || ["reading", "checking", "sending"].includes(local.organization.getSnapshot().phase)
      || isGroundedSending()) throw new Error("conversation-response-running");
  }, [local.organizationExecution.managed, local.finding, local.organization, getChatSnapshot, isGroundedSending]);
  const reset = useCallback(() => {
    assertCanChange();
    local.finding.reset();
    local.organization.reset();
    local.preview.close();
    resetGrounded();
    submitting.current = null;
    setTask(null);
    setChoice(null);
    store.select({ mode: null });
    setGroundedRequest(null);
  }, [local.finding, local.organization, local.preview, assertCanChange, resetGrounded, store]);

  const resume = () => {
    if (!task?.waitingForSource || !connected || blocked || task.kind === "grounded") return;

    requests.submitRequest(task.request, task.kind);
    setTask({ ...task, waitingForSource: false });
  };

  const updateTask = chat.updateTask;

  useEffect(() => {
    if (!task || task.waitingForSource || task.kind === "grounded") return;

    if (task.kind === "find") {
      const answer = finding.issue ?? (finding.phase === "ready"
        ? "검색을 마쳤어요."
        : finding.phase === "searching"
          ? "이 기기에서 자료를 찾고 있어요."
          : finding.phase === "cancelled" ? "자료 찾기를 중지했어요." : "검색할 범위와 날짜 기준을 확인해 주세요.");

      updateTask(
        task.id,
        answer,
        finding.phase === "searching"
          ? "pending"
          : finding.phase === "error" ? "error" : finding.phase === "cancelled" ? "stopped" : "completed"
      );
    } else {
      const answer = organization.issue ?? (organization.result
        ? "정리 제안을 확인해 주세요. 원본 변경은 계획 검토 뒤 별도로 실행합니다."
        : organization.phase === "scope"
          ? "정리할 자료의 범위를 확인해 주세요."
          : organization.snapshot
            ? `자료 ${organization.snapshot.documents.length}개를 준비했어요. 범위와 발췌·전송 동의를 확인해 주세요.`
            : "자료의 범위와 정리 조건을 확인해 주세요.");

      updateTask(
        task.id,
        answer,
        ["reading", "checking", "sending"].includes(organization.phase)
          ? "pending"
          : organization.phase === "error" ? "error" : "completed"
      );
    }
  }, [task, finding, organization, updateTask]);

  const startMaterial = (kind: "find" | "organize", request: string) => {
    if (blocked || local.organizationExecution.managed.getSnapshot().phase === "running") return;

    const id = chat.recordTask(kind, request, connected ? "자료 작업을 준비하고 있어요." : "이 요청에 사용할 자료 폴더를 연결해 주세요.");

    if (!id) return;

    grounded.cancel();
    setTask({ id, kind, request, waitingForSource: !connected });
    setChoice(null);
    chat.updateDraft("");

    if (connected) requests.submitRequest(request, kind);
  };

  const submit = async (selected?: WorkspaceRequestKind) => {
    const request = chat.getSnapshot().draft.trim();

    if (!request || blocked || submitting.current || chat.getSnapshot().turns.length >= AI_RECORD_LIMITS.conversationTurns
      || local.organizationExecution.managed.getSnapshot().phase === "running") return;

    const kind = selected ?? intent;

    if (!selected && task?.kind === "organize" && canContinueWorkspaceTask(mode, "organize") && organization.snapshot && organization.questions.length) {
      const documents = organization.snapshot.documents.filter(document => organization.selectedIds.includes(document.id)).map(document => ({ ...document, sourcePath: document.path.slice(0, -1) }));
      let validReply = false;

      try {
        parseOrganizationReply(request, organization.questions, documents);
        validReply = true;
      }
      catch {
        if (/기준일로|폴더로/u.test(request) || documents.some(document => request.includes(document.name))) {
          setChoice(request);

          return;
        }
      }

      if (validReply) {
        local.organization.updateReply(request);
        local.organization.submitReply();

        const id = chat.recordTask(
          "organize",
          request,
          "답변을 정리 기준에 반영했어요. 기준과 발췌를 확인하고 새로 동의한 뒤 전송해 주세요.",
          "completed"
        );

        if (id) setTask({ ...task, id });

        chat.updateDraft("");

        return;
      }
    }

    if (!selected && (kind === "chat" || kind === "find") && task?.kind === "find" && canContinueWorkspaceTask(mode, "find")
      && parseFindReply(request, new Date().getFullYear()).kind !== "none") {
      local.finding.submitReply(request);

      const current = local.finding.getSnapshot();
      const id = chat.recordTask("find", request, current.issue ?? "검색 조건을 반영했어요. 기간과 기준을 확인한 뒤 검색 시작을 눌러 주세요.");

      if (id) setTask({ ...task, id });

      chat.updateDraft("");

      return;
    }

    if (kind === "choose") {
      setChoice(request);

      return;
    }

    setChoice(null);

    if (kind === "chat") {
      await chat.send();

      return;
    }

    if (kind === "find" || kind === "organize") {
      startMaterial(kind, request);

      return;
    }

    if (!grounded.canSend) {
      setGroundedRequest(request);

      return;
    }

    const id = chat.recordTask("grounded", request, "선택 자료의 원본을 확인하고 답변을 기다리고 있어요.");

    if (!id) return;

    setTask({ id, kind: "grounded", request, waitingForSource: false });

    const operation = Symbol();

    submitting.current = operation;

    try {
      const result = await grounded.send(id);

      if (submitting.current !== operation) return;

      chat.updateTask(
        id,
        result?.answer ?? "자료 답변을 게시하지 못했어요. 원본과 동의를 확인하고 다시 요청해 주세요.",
        result ? "completed" : "stopped",
        result?.evidence
      );

      if (result) chat.updateDraft("");
    } finally {
      if (submitting.current === operation) submitting.current = null;
    }
  };

  const prepareFound = (kind: "organize" | "grounded") => {
    if (blocked || !connected || local.organizationExecution.managed.getSnapshot().phase === "running") return;

    const current = local.finding.getSnapshot();

    if (current.phase !== "ready" || !current.result || !current.selectedPaths.length) return;

    const request = kind === "grounded" ? chat.getSnapshot().draft.trim() || current.request : `${current.filters.terms} 자료 정리`;
    if (kind === "grounded") {
      if (prepareFoundDocuments({ finding: local.finding, organization: local.organization, preview: local.preview }, true, request)) {
        store.select({ mode: "grounded" });
        chat.updateDraft(request);
        setTask(null);
        setChoice(null);
      }

      return;
    }
    const id = chat.recordTask("organize", request, "선택한 자료를 다시 읽어 정리 조건을 준비하고 있어요.");

    if (!id) return;

    if (prepareFoundDocuments(
      { finding: local.finding, organization: local.organization, preview: local.preview },
      true
    )) {
      setTask({ id, kind: "organize", request, waitingForSource: false });
      chat.updateDraft("");
    } else chat.updateTask(id, "자료 선택이 바뀌었어요. 검색 결과에서 다시 선택해 주세요.", "error");
  };

  const cancel = () => {
    if (chat.state.active) {
      chat.stop();

      return;
    }

    if (grounded.pending) {
      grounded.cancel();
      submitting.current = null;
    }
    else if (finding.phase === "searching") local.finding.cancel();
    else if (["reading", "checking", "sending"].includes(organization.phase)) local.organization.cancel();

    if (task) chat.updateTask(task.id, "진행 중인 응답·자료 읽기를 중지했어요. 자동으로 다시 실행하지 않습니다.", "stopped");
  };

  return {
    task,
    mode,
    selectMode: (value: WorkspaceRequestKind) => {
      if (blocked) return;

      store.select({ mode: value });
      setChoice(null);
      requestAnimationFrame(() => document.getElementById("message-draft")?.focus());
    },
    intent,
    pending,
    blocked,
    grounded,
    submit,
    cancel,
    reset,
    prepareFound: () => prepareFound("organize"),
    prepareFoundForQuestion: () => prepareFound("grounded"),
    prepareQuestionSelection: () => prepareQuestionSelection({ organization: local.organization, preview: local.preview }, local.listing.getSnapshot(), chat.getSnapshot().draft, connected && !blocked),
    reprepareQuestionSources: () => reprepareQuestionSources({ organization: local.organization, preview: local.preview }, chat.getSnapshot().draft, connected && !blocked),
    resume,
    assertCanChange,
    canStart: connected && !blocked,
    choice: choice === chat.state.draft ? choice : null,
    cancelChoice: () => {
      setChoice(null);
      requestAnimationFrame(() => document.getElementById("message-draft")?.focus());
    },
  };
}

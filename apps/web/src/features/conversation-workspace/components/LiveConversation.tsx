"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ConversationWorkspace,
  type ConversationMessage,
} from "../../../components/layout/ConversationWorkspace";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import { useSharedSourceFolderConnection } from "../../local-folders/providers/SourceFolderProvider";
import { SourceFolderTree } from "../../local-folders/components/listing/SourceFolderTree";
import { SourceConnectionControl } from "../../local-folders/components/connection/SourceConnectionControl";
import { OrganizationPreparationPanel } from "../../local-folders/components/organization/OrganizationPreparationPanel";
import type { LiveOrganizationAction } from "../../../shared/live-organization";
import { FindConversation } from "./FindConversation";
import type { AiProvider } from "../../../shared/ai-provider";
import { classifyConversationRequest } from "../lib/request-routing";
import { RequestIntentChoice } from "./RequestIntentChoice";
import { useConversationRequests } from "../hooks/useConversationRequests";

export function LiveConversation({
  organizeAction,
  aiProvider = "gemini",
}: {
  organizeAction?: LiveOrganizationAction;
  aiProvider?: AiProvider | null;
}) {
  const local = useSharedSourceFolderConnection();
  const {
    state: connection,
    organization,
    finding,
  } = local;
  const findState = useSyncExternalStore(
    finding.subscribe,
    finding.getSnapshot,
    finding.getServerSnapshot,
  );
  const state = useSyncExternalStore(
    organization.subscribe,
    organization.getSnapshot,
    organization.getServerSnapshot,
  );
  const connected = connection.view?.status === "connected";
  const reading = state.phase === "reading";
  const checking = state.phase === "checking";
  const sending = state.phase === "sending";
  const pending = reading || checking || sending;
  const answering = !!state.snapshot && state.questions.length > 0;
  const currentDraft = findState.phase !== "idle" ? findState.draft : state.request;
  const requests = useConversationRequests(local, currentDraft);
  const pendingRequest = requests.pendingRequest;
  const requestChoice = connected && pendingRequest !== null && pendingRequest === currentDraft ? (
    <RequestIntentChoice
      disabled={!requests.canStart}
      onChoose={intent => requests.submitRequest(pendingRequest, intent)}
      onCancel={requests.cancelChoice}
    />
  ) : null;
  const requestIntent = classifyConversationRequest(state.request);
  const messages: ConversationMessage[] = [];
  if (state.submittedRequest) {
    messages.push({
      id: "request",
      author: "user",
      text: state.submittedRequest,
    });
    let text: string | null = null;
    if (state.phase === "scope") {
      text = "어디에서 자료를 찾을까요? 아래에서 범위를 확인해 주세요.";
    } else if (state.result) {
      text = state.result.organization.held.length
        ? "정리 전에 확인할 기준을 모았어요. 아래 질문에 답해 주세요."
        : "이렇게 모으면 어떨까요? 정리 모습을 확인하고 복사 또는 이동을 선택해 주세요.";
    } else if (state.issue) {
      text = state.issue;
    } else if (state.phase === "ready") {
      text = `자료 ${state.snapshot?.documents.length ?? 0}개를 찾았어요. 전송할 자료와 조건을 확인해 주세요.`;
    } else if (!pending) {
      text =
        "조건이 바뀌었거나 준비를 중지했어요. 설정한 범위를 다시 확인해 주세요.";
    }
    if (text) messages.push({ id: "preparation", author: "assistant", text });
    if (state.submittedReply) {
      messages.push({
        id: "reply",
        author: "user",
        text: state.submittedReply,
      });
      messages.push({
        id: "reply-confirmed",
        author: "assistant",
        text: "답변을 반영했어요. 아래 기준을 확인하고 새로 동의한 뒤 전송하면 AI 제안에 반영됩니다.",
      });
    }
  }

  if (findState.phase !== "idle") return <FindConversation
    state={findState}
    canStart={requests.canStart}
    onRequest={requests.submitRequest}
    onDraftChange={requests.updateFindDraft}
    onReturn={requests.returnToOrganization}
    onPrepare={requests.prepareFound}
    requestChoice={requestChoice}
  />;
  return (
    <WorkspaceShell
      title="채팅"
      active="chat"
      folderTree={<SourceFolderTree />}
    >
      <ConversationWorkspace
        messages={messages}
        draft={answering ? state.replyDraft : state.request}
        onDraftChange={
          answering
            ? organization.updateReply
            : requests.updateOrganizationDraft
        }
        onSend={() => {
          if (answering) organization.submitReply();
          else requests.submitRequest(state.request);
        }}
        canSend={requests.canStart}
        pending={pending}
        pendingLabel={
          checking
            ? "전송 전 원본 내용과 발췌를 다시 확인하고 있어요…"
            : sending
              ? "확인한 발췌로 AI 제안을 기다리고 있어요…"
              : "선택한 범위의 TXT/MD를 이 기기에서 읽고 있어요…"
        }
        submitLabel={
          answering
            ? "답변 반영"
            : requestIntent === "find"
              ? "찾을 조건 확인"
              : requestIntent === "organize" ? "자료 준비" : "작업 선택"
        }
        inputLabel={answering ? "확인 질문에 대한 답변" : undefined}
        inputPlaceholder={
          answering
            ? "파일 이름과 날짜 기준 또는 ‘폴더명 폴더로’를 적어 주세요"
            : undefined
        }
        cancelLabel={sending ? "응답 대기 중지" : "자료 준비 중지"}
        onCancel={organization.cancel}
        panelOpen={false}
        onPanelChange={() => {}}
        showComposer={connected}
        scope={
          connected && (
            <div>
              {answering && (
                <p>
                  질문에 대한 답변을 적어 주세요. 반영 후에도 AI 전송은 따로
                  확인합니다.
                </p>
              )}
              <p>
                범위:{" "}
                {state.scope?.kind === "all"
                  ? "연결한 폴더 전체"
                  : state.scope?.kind === "folder"
                    ? state.scope.path.join(" / ") || "연결 폴더"
                    : state.scope?.kind === "selected"
                      ? `선택한 ${state.scope.entries.length}개`
                      : "자료 준비 전에 확인"}{" "}
                · 자료 {state.selectedIds.length}개
              </p>
            </div>
          )
        }
        intro={
          <>
            <h2 tabIndex={-1} data-conversation-title>
              {connected ? "어떤 자료로 작업할까요?" : "자료 폴더를 연결하세요"}
            </h2>
            {!connected ? (
              <>
                <p>
                  폴더를 선택하면 왼쪽에서 구조를 확인할 수 있어요. 파일은 이
                  기기에 보관됩니다.
                </p>
                <SourceConnectionControl />
              </>
            ) : (
              <>
                <p>
                  찾거나 정리할 내용을 적어 주세요. 범위와 발췌를 확인한
                  뒤 선택한 자료만 AI에 보낼 수 있어요. AI 분석만으로 원본을
                  바꾸지 않으며 실제 파일 작업은 검토 후 별도로 실행합니다.
                </p>
                <Link href="/demo">AI 정리 샘플 체험하기</Link>
              </>
            )}
          </>
        }
        panel={null}
        interaction={
          requestChoice ?? (connected && state.submittedRequest ? (
            <OrganizationPreparationPanel organizeAction={organizeAction} aiProvider={aiProvider} />
          ) : undefined)
        }
      />
    </WorkspaceShell>
  );
}

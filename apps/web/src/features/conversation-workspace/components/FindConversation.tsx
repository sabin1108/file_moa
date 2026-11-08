"use client";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import { ConversationWorkspace } from "../../../components/layout/ConversationWorkspace";
import { actionClasses } from "../../../components/ui/action-classes";
import { useSharedSourceFolderConnection } from "../../local-folders/providers/SourceFolderProvider";
import { SourceFolderTree } from "../../local-folders/components/listing/SourceFolderTree";
import { DocumentFindPanel } from "../../local-folders/components/organization/DocumentFindPanel";
import { SourceDocumentPreview } from "../../local-folders/components/preview/SourceDocumentPreview";
import type { DocumentFindState } from "../../local-folders/store/document-find-controller";

export function FindConversation({ state, onRequest, onDraftChange, onReturn, onPrepare, requestChoice, canStart }: {
  state: DocumentFindState;
  onRequest: (request: string) => void;
  onDraftChange: (request: string) => void;
  onReturn: () => void;
  onPrepare: () => void;
  requestChoice: ReactNode;
  canStart: boolean;
}) {
  const connection = useSharedSourceFolderConnection();
  const controller = connection.finding;
  const preview = useSyncExternalStore(
    connection.preview.subscribe,
    connection.preview.getSnapshot,
    connection.preview.getServerSnapshot,
  );
  const listing = useSyncExternalStore(
    connection.listing.subscribe,
    connection.listing.getSnapshot,
    connection.listing.getServerSnapshot,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const showing =
    !!preview.path &&
    !!state.result?.documents.some(
      (document) =>
        JSON.stringify(document.path) === JSON.stringify(preview.path),
    );
  useEffect(() => {
    if (showing) heading.current?.focus();
  }, [showing, preview.phase]);
  const folderName = connection.state.view?.folderName ?? "내 폴더";
  return (
    <WorkspaceShell
      title="자료 찾기"
      active="chat"
      folderTree={<SourceFolderTree />}
    >
      <ConversationWorkspace
        messages={[
          { id: "find-request", author: "user", text: state.request },
          {
            id: "find-status",
            author: "assistant",
            text:
              state.phase === "ready"
                ? "찾은 후보와 본문 근거를 확인해 주세요."
                : "검색할 범위와 날짜 기준을 확인해 주세요.",
          },
          ...(state.submittedReply ? [
            { id: "find-reply", author: "user" as const, text: state.submittedReply },
            { id: "find-reply-confirmed", author: "assistant" as const, text: "검색 조건을 반영했어요. 표시된 기간과 기준을 확인한 뒤 검색 시작을 눌러 주세요." },
          ] : []),
        ]}
        draft={state.draft}
        onDraftChange={onDraftChange}
        onSend={() => onRequest(state.draft)}
        canSend={canStart}
        pending={state.phase === "searching"}
        pendingLabel="TXT·MD 본문에서 자료를 찾고 있어요…"
        onCancel={controller.cancel}
        cancelLabel="검색 중지"
        submitLabel="새 요청 확인"
        inputLabel="새 자료 요청"
        inputPlaceholder="예: 2026년 회의일 기준 / 성능 보고서 정리해줘"
        panel={null}
        panelOpen={false}
        onPanelChange={() => {}}
        intro={null}
        notice={
          <button
            type="button"
            className={actionClasses("ghost")}
            disabled={!canStart}
            onClick={onReturn}
          >
            정리 요청으로 돌아가기
          </button>
        }
        scope={<p>이 기기에서만 검색 · TXT·MD</p>}
        interaction={
          requestChoice ?? <>
            <div hidden={showing}>
              <DocumentFindPanel
                controller={controller}
                state={state}
                folderName={folderName}
                currentPath={listing.result?.path ?? []}
                onPrepare={onPrepare}
                canPrepare={canStart}
                onOpenFile={(path) => {
                  trigger.current =
                    document.activeElement instanceof HTMLElement
                      ? document.activeElement
                      : null;
                  void connection.preview.open(path);
                }}
              />
            </div>
            {showing && (
              <div data-find-preview>
                <SourceDocumentPreview
                  state={preview}
                  folderName={folderName}
                  headingRef={heading}
                  onClose={() => {
                    connection.preview.close();
                    requestAnimationFrame(() => {
                      if (trigger.current?.isConnected)
                        trigger.current.focus({ preventScroll: true });
                    });
                  }}
                  onRefresh={connection.preview.refresh}
                  onCancel={connection.preview.cancel}
                />
              </div>
            )}
          </>
        }
      />
    </WorkspaceShell>
  );
}

"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { WorkspaceShell } from "../../../components/layout/WorkspaceShell";
import { ConversationWorkspace } from "../../../components/layout/ConversationWorkspace";
import { actionClasses } from "../../../components/ui/action-classes";
import { useSharedSourceFolderConnection } from "../../local-folders/providers/SourceFolderProvider";
import { SourceFolderTree } from "../../local-folders/components/listing/SourceFolderTree";
import { DocumentFindPanel } from "../../local-folders/components/organization/DocumentFindPanel";
import { SourceDocumentPreview } from "../../local-folders/components/preview/SourceDocumentPreview";
import type { DocumentFindState } from "../../local-folders/store/document-find-controller";

export function FindConversation({ state }: { state: DocumentFindState }) {
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
        ]}
        draft={state.draft}
        onDraftChange={controller.updateDraft}
        onSend={() => {
          connection.preview.close();
          controller.start(state.draft);
        }}
        canSend={connection.state.view?.status === "connected"}
        pending={state.phase === "searching"}
        pendingLabel="TXT·MD 본문에서 자료를 찾고 있어요…"
        onCancel={controller.cancel}
        cancelLabel="검색 중지"
        submitLabel="찾을 조건 확인"
        inputLabel="새로 찾을 자료 요청"
        inputPlaceholder="예: 10월쯤 한 회의 자료를 찾아줘"
        panel={null}
        panelOpen={false}
        onPanelChange={() => {}}
        intro={null}
        showComposer={state.phase !== "confirm"}
        notice={
          <button
            type="button"
            className={actionClasses("ghost")}
            onClick={() => {
              connection.preview.close();
              controller.reset();
            }}
          >
            정리 요청으로 돌아가기
          </button>
        }
        scope={<p>이 기기에서만 검색 · TXT·MD</p>}
        interaction={
          <>
            <div hidden={showing}>
              <DocumentFindPanel
                controller={controller}
                state={state}
                folderName={folderName}
                currentPath={listing.result?.path ?? []}
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

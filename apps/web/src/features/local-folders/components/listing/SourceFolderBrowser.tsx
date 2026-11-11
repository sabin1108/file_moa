"use client";

/**
 * /files의 기능 조합점이다. Provider의 목록/본문 store를 구독해 탐색·선택·원문 화면을 연결한다.
 * 파일 접근은 services가 담당하며, 여기서는 미리보기 전환과 초점/스크롤 복귀를 관리한다. 연결 설정은 connection의 dialog를 재사용한다.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useSharedSourceFolderConnection } from "../../providers/SourceFolderProvider";
import { SourceFolderSettingsDialog } from "../connection/SourceFolderSettingsDialog";
import { FolderListingView } from "./FolderListingView";
import { SourceDocumentPreview } from "../preview/SourceDocumentPreview";
import { SourcePlanDialog } from "../plan/SourcePlanDialog";
import { useSourceNavigation } from "../../hooks/use-source-navigation";
import { FolderWorkspaceFrame } from "./FolderWorkspaceFrame";
import { FilePreviewPane } from "../preview/FilePreviewPane";
import { NewEntryForm } from "./NewEntryForm";
import { FolderHistoryDialog } from "../history/FolderHistoryDialog";
import { RecoveryArchiveDialog } from "../recovery/RecoveryArchiveDialog";
import { useManagedFiles } from "../../hooks/use-managed-files";
import { ManagedFilesDialog } from "../managed/ManagedFilesDialog";
import { actionClasses } from "../../../../components/ui/action-classes";
import { useInlineEditor } from "../../hooks/use-inline-editor";
import { InlineDocumentEditor } from "../preview/InlineDocumentEditor";
import { useWorkspaceWorkflow } from "../../hooks/use-workspace-workflow";
import { DismissibleNotice } from "../../../../components/ui/feedback/DismissibleNotice";
import { SourceFolderTree } from "./SourceFolderTree";
/** 화면 조합과 초점·스크롤만 맡는다. 파일 접근과 요청 수명은 controller/session이 소유한다. */

export function SourceFolderBrowser() {
  const { state: connection, listing, preview, plan, navigation, trail, search, recoveryView, recoveryKey } = useSharedSourceFolderConnection();
  const managed = useManagedFiles();
  const editor = useInlineEditor();
  const restoredNotice = useWorkspaceWorkflow(managed, editor);
  const editorState = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getServerSnapshot);
  const refreshEdited = useCallback(() => {
    void preview.refresh();
  }, [preview]);

  useSourceNavigation(navigation);

  const state = useSyncExternalStore(listing.subscribe, listing.getSnapshot, listing.getServerSnapshot);
  const previewState = useSyncExternalStore(preview.subscribe, preview.getSnapshot, preview.getServerSnapshot);
  const ancestors = useSyncExternalStore(trail.subscribe, trail.getSnapshot, trail.getServerSnapshot);
  const searchState = useSyncExternalStore(search.subscribe, search.getSnapshot, search.getServerSnapshot);
  const heading = useRef<HTMLHeadingElement>(null);
  const documentHeading = useRef<HTMLHeadingElement>(null);
  const documentKey = JSON.stringify(previewState.path);
  const isPreviewOpen = previewState.path !== null;

  useEffect(() => {
    if (isPreviewOpen) {
      documentHeading.current?.focus({ preventScroll: true });
    }
  }, [documentKey, isPreviewOpen]);

  const previousPhase = useRef(state.phase);
  const previousPreviewPhase = useRef(previewState.phase);

  useEffect(() => {
    // 탐색/취소 버튼이 사라졌을 때만 복구한다. 사용자가 옮긴 초점은 빼앗지 않는다.
    if (previousPhase.current === "loading" && state.phase !== "loading"
      && window.document.activeElement === window.document.body
      && heading.current?.getClientRects().length) {
      heading.current.focus({ preventScroll: true });
    }

    previousPhase.current = state.phase;
  }, [state.phase]);

  useEffect(() => {
    // 비동기 완료나 취소로 버튼이 제거되어 body로 빠진 초점을 문서 제목으로 돌린다.
    if (previousPreviewPhase.current === "loading" && previewState.phase !== "loading"
      && window.document.activeElement === window.document.body
      && documentHeading.current?.getClientRects().length) {
      documentHeading.current.focus({ preventScroll: true });
    }

    previousPreviewPhase.current = previewState.phase;
  }, [previewState.phase]);

  return (
    <>
      {restoredNotice
        && (
          <DismissibleNotice
            state="attention"
            title={restoredNotice.text}
            autoDismissMs={restoredNotice.blocking ? 0 : 5000}
          />
        )}
      <FolderWorkspaceFrame
        folderTree={<SourceFolderTree />}
        rootName={connection.view?.folderName ?? "내 폴더"}
        path={state.result?.path ?? []}
        ancestors={ancestors}
        disabled={!state.available || state.phase === "loading"}
        onOpen={navigation.openFolder}
        onOpenFile={navigation.openFile}
        onSelectPrevious={navigation.selectFromPrevious}
        footer={
          <span>
            {state.result?.path.at(-1) ?? connection.view?.folderName ?? "폴더 연결 필요"}
            {" · "}
            {state.result?.entries.length ?? 0}
            {"개 항목 · "}
            {state.selectedNames.length}개 선택
          </span>
        }
        preview={
          <FilePreviewPane
            open={isPreviewOpen || editorState.open}
            onClose={() => {
              if (editor.getSnapshot().open) {
                if (editor.close()) void preview.refresh();
              } else navigation.closeFile();
            }}
          >
            {editorState.open
              ? (
                <InlineDocumentEditor
                  controller={editor}
                  folderName={connection.view?.folderName ?? "연결 폴더"}
                  onClosed={refreshEdited}
                  onSaved={refreshEdited}
                />
              )
              : (
                <SourceDocumentPreview
                  key={documentKey}
                  state={previewState}
                  folderName={connection.view?.folderName ?? null}
                  headingRef={documentHeading}
                  onClose={navigation.closeFile}
                  onRefresh={preview.refresh}
                  onCancel={preview.cancel}
                  onEdit={() => {
                    const path = preview.getSnapshot().path;

                    if (path) void editor.open(path);
                  }}
                />
              )}
          </FilePreviewPane>
        }
      >
        <FolderListingView
          state={state}
          searchState={searchState}
          onSearchCancel={search.cancel}
          onSearchRetry={search.retry}
          onSelectSearch={navigation.selectFromPrevious}
          folderName={connection.view?.folderName ?? null}
          headingRef={heading}
          connectionControls={<SourceFolderSettingsDialog compact />}
          historyControls={
            <>
              <FolderHistoryDialog
                key={JSON.stringify([listing.getEpoch(), state.result?.path])}
                path={state.result?.path ?? []}
                folderName={connection.view?.folderName ?? "내 폴더"}
                disabled={!state.available || state.phase !== "ready" || state.stale}
              />
              <RecoveryArchiveDialog key={recoveryKey} resumeOnReload />
              <button
                type="button"
                className={actionClasses("secondary")}
                disabled={!state.available || state.phase !== "ready"}
                onClick={() => {
                  void managed.showArchives();
                }}
              >
                휴지통·보존 기록
              </button>
            </>
          }
          onOpen={navigation.openFolder}
          onOpenFile={navigation.openFile}
          onRefresh={listing.refresh}
          onRetry={listing.retry}
          onCancel={listing.cancel}
          onToggleSelection={listing.toggleSelection}
          onSelectAll={listing.selectAll}
          onClearVisibleSelection={() => {
            listing.clearVisibleSelection();

            if (!listing.getSnapshot().selectionOpen) {
              heading.current?.focus({ preventScroll: true });
            }
          }}
          onQueryChange={listing.setQuery}
          onSearchOpen={listing.setSearchOpen}
          onClearSelection={() => {
            listing.clearSelection();
          }}
          onExitSelection={() => {
            listing.exitSelection();
            heading.current?.focus({ preventScroll: true });
          }}
          onReviewPlan={operation => {
            const current = listing.getSnapshot();
            const folders = current.result?.entries.some(
              entry => entry.kind === "directory" && current.selectedNames.includes(entry.name),
            );

            if (operation === "move" || folders) {
              void managed.open({
                kind: operation,
                source: current.result?.path ?? [],
                names: current.selectedNames,
                destination: current.result?.path ?? [],
              });
            } else plan.open(operation);
          }}
          onTrash={() => {
            const current = listing.getSnapshot();

            void managed.open({
              kind: "trash",
              source: current.result?.path ?? [],
              names: current.selectedNames,
              destination: [],
            });
          }}
          previewName={previewState.path?.at(-1) ?? null}
          creation={
            <NewEntryForm
              key={JSON.stringify([listing.getEpoch(), state.result?.path])}
              path={state.result?.path ?? []}
              folderName={connection.view?.folderName ?? "내 폴더"}
              disabled={!state.available || state.phase !== "ready" || state.stale}
              onCreated={listing.refresh}
            />
          }
        />
      </FolderWorkspaceFrame>
      <SourcePlanDialog
        controller={plan}
        folderName={connection.view?.folderName ?? "자료 폴더"}
        vaultName={recoveryView.folderName ?? "연결되지 않음"}
        onMove={() => {
          const previous = plan.getSnapshot();

          plan.close();

          const current = listing.getSnapshot();

          void managed.open(
            {
              kind: "move",
              source: current.result?.path ?? [],
              names: current.selectedNames,
              destination: previous.destination.split("/").filter(Boolean),
            },
            previous.destinationConfirmed,
          );
        }}
        onCopied={async path => {
          await navigation.openFolder(path);
          heading.current?.focus({ preventScroll: true });
        }}
      />
      <ManagedFilesDialog
        controller={managed}
        folderName={connection.view?.folderName ?? "자료 폴더"}
        disabled={connection.view?.status !== "connected" || !!connection.pending}
        onChanged={() => {
          listing.refresh();

          if (preview.getSnapshot().path) preview.refresh();
        }}
      />
    </>
  );
}

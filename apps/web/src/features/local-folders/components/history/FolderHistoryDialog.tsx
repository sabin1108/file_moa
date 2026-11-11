"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { useSharedSourceFolderConnection } from "../../providers/SourceFolderProvider";
import { FolderHistoryController, type HistoryIssue } from "../../store/folder-history-controller";
import { FolderHistoryView, historyTime } from "./FolderHistoryView";
import dialogStyles from "../connection/source-folder-settings-dialog.module.css";
import styles from "./folder-history.module.css";

const issues: Record<HistoryIssue, string> = {
  permission: "폴더를 읽을 권한이 필요해요. 연결 관리에서 다시 연결해 주세요.",
  missing: "기록을 읽을 폴더를 찾지 못했어요. 폴더 목록을 새로고침해 주세요.",
  location: "기록 위치에 같은 이름의 파일이 있어 읽을 수 없어요.",
  stale: "폴더 연결이 바뀌었어요. 현재 폴더에서 다시 열어 주세요.",
  read: "작업 기록을 읽지 못했어요. 다시 시도해 주세요.",
};

/** 팝업과 요청 수명을 연결한다. 부모가 위치/연결별 key를 바꾸면 진행 중 읽기도 폐기한다. */

export function FolderHistoryDialog({ path, folderName, disabled }: {
  path: readonly string[];
  folderName: string;
  disabled: boolean;
}) {
  const { readHistory, inspectHistoryTarget, inspectCopyHistory, inspectRestoreHistory } = useSharedSourceFolderConnection();
  const [controller] = useState(() => new FolderHistoryController(
    readHistory,
    inspectHistoryTarget,
    inspectCopyHistory,
    inspectRestoreHistory
  ));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    if (disabled) {
      dialog.current?.close();
      controller.close();
    }
  }, [disabled, controller]);

  useEffect(() => {
    if (state.open) heading.current?.focus();
  }, [state.open]);

  const close = () => {
    dialog.current?.close();
    controller.close();
  };
  const pending = state.phase === "loading";

  return (
    <>
      <button
        type="button"
        className={actionClasses("ghost")}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={state.open}
        onClick={() => {
          dialog.current?.showModal();
          void controller.open(path);
        }}
      >
        작업 기록
      </button>
      <dialog
        ref={dialog}
        id={id}
        className={dialogStyles.dialog}
        aria-labelledby={`${id}-title`}
        onCancel={event => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (!dialog.current?.open) controller.close();
        }}
      >
        {state.open && !disabled
          && (
            <section data-history-phase={state.phase}>
              <div className={dialogStyles.header}>
                <h2 ref={heading} id={`${id}-title`} tabIndex={-1}>
                  작업 기록
                </h2>
                <button
                  type="button"
                  className={actionClasses("ghost")}
                  aria-label="작업 기록 닫기"
                  onClick={close}
                >
                  닫기
                </button>
              </div>
              <p className={styles.location}>
                {[folderName, ...state.path].join(" / ")}
              </p>
              <p className={styles.note}>
                이 위치에 저장된 생성·복사·복원 기록입니다. 저장 당시 결과와 현재 파일 상태는 다를 수
                있어요.
              </p>
              <div className={styles.toolbar}>
                <p className={styles.note}>
                  {state.checkedAt
                    ? `읽은 시각 · ${historyTime(state.checkedAt)}`
                    : "기록을 읽기만 하며 파일을 변경하지 않습니다."}
                </p>
                <button
                  type="button"
                  className={actionClasses("secondary")}
                  onClick={pending ? controller.cancel : () => void controller.refresh()}
                >
                  {pending ? "기록 읽기 취소" : "기록 새로고침"}
                </button>
              </div>
              {pending && <StatusNotice state="pending" title="작업 기록을 읽고 있어요." />}
              {state.phase === "cancelled"
                && (
                  <StatusNotice state="attention" title="기록 읽기를 취소했어요." />
                )}
              {state.phase === "error" && state.issue
                && (
                  <StatusNotice state="error" title={issues[state.issue]} />
                )}
              {state.result
                && (
                  <FolderHistoryView
                    result={state.result}
                    inspection={state.inspection}
                    onInspect={controller.inspectTarget}
                    onCancelInspection={controller.cancelInspection}
                    copyInspection={state.copyInspection}
                    onInspectCopy={controller.inspectCopyTarget}
                    onCancelCopy={controller.cancelCopyInspection}
                    restoreInspection={state.restoreInspection}
                    onInspectRestore={controller.inspectRestoreTarget}
                  />
                )}
            </section>
          )}
      </dialog>
    </>
  );
}

"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { useSharedSourceFolderConnection } from "../../providers/SourceFolderProvider";
import { RecoveryArchiveController } from "../../store/recovery-archive-controller";
import { RecoveryArchiveView } from "./RecoveryArchiveView";
import dialogStyles from "../connection/source-folder-settings-dialog.module.css";
import styles from "../history/folder-history.module.css";
import { RecoveryRestoreController } from "../../store/recovery-restore-controller";
import { RecoveryRestoreView } from "./RecoveryRestoreView";
import { RecoveryWorkflowBridge, RecoveryWorkflowSteps } from "../../hooks/use-recovery-workflow";

/** 기존 dialog 표면을 재사용한다. 부모 key와 session이 연결 수명을 제어한다. */
export function RecoveryArchiveDialog({ resumeOnReload = false }: { resumeOnReload?: boolean }) {
  const { readRecoveryArchive, inspectRecoveryArchive, recoveryView, recoveryState, state: source,
    readRestoreDestination, prepareRecoveryRestore, executeRecoveryRestore, discardRecoveryRestore } = useSharedSourceFolderConnection();
  const [restore] = useState(() => new RecoveryRestoreController(readRestoreDestination, prepareRecoveryRestore, executeRecoveryRestore, discardRecoveryRestore));
  const [controller] = useState(() => new RecoveryArchiveController(readRecoveryArchive, inspectRecoveryArchive, restore));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const restoreState = useSyncExternalStore(restore.subscribe, restore.getSnapshot, restore.getServerSnapshot);
  const picker = useSyncExternalStore(restore.picker.subscribe, restore.picker.getSnapshot, restore.picker.getServerSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const disabled = recoveryView.status !== "connected" || !!recoveryState.pending || source.view?.status !== "connected" || !!source.pending;
  const close = () => {
    if (!controller.close()) return;
    dialog.current?.close();
    if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus({ preventScroll: true });
  };
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    if (disabled) { dialog.current?.close(); controller.dispose(); }
  }, [disabled, controller]);
  useEffect(() => {
    if (!state.open) dialog.current?.close();
    else { if (!dialog.current?.open) dialog.current?.showModal(); heading.current?.focus({ preventScroll: true }); }
  }, [state.open]);
  const reading = state.phase === "loading" || state.detail?.phase === "loading";
  const restoring = restoreState.phase !== "idle";

  return <>
    <button ref={trigger} type="button" className={actionClasses("secondary")} disabled={disabled}
      aria-haspopup="dialog" aria-controls={id} aria-expanded={state.open}
      onClick={() => { dialog.current?.showModal(); void controller.open(); }}>복구 보관함 보기</button>
    <dialog ref={dialog} id={id} className={dialogStyles.dialog} aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); if (picker.open) restore.picker.close(); else close(); }}
      onClose={event => { event.stopPropagation(); if (!dialog.current?.open) controller.close(); }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        event.stopPropagation();
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button,summary,[tabindex]")]
          .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.checkVisibility());
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      {resumeOnReload && <RecoveryWorkflowBridge controller={controller} restore={restore} />}
      {state.open && !disabled && <section data-archive-phase={state.phase}>
        <div className={dialogStyles.header}>
          <h2 ref={heading} id={`${id}-title`} tabIndex={-1}>{restoring ? "복구 사본 복원" : "복구 보관함"}</h2>
          <button type="button" className={actionClasses("ghost")} aria-label="복구 보관함 닫기" onClick={close}>{restoreState.phase === "running" ? "복원 중단" : "닫기"}</button>
        </div>
        <p className={styles.location}>{recoveryView.folderName}</p>
        {resumeOnReload && restoring && <RecoveryWorkflowSteps />}
        <p className={styles.note}>{restoring ? "보관한 사본을 새 파일로 복원합니다. 기존 파일과 보관본은 유지합니다." : "기존 파일의 복구 사본입니다. 목록과 확인은 파일을 변경하지 않습니다."}</p>
        {!restoring && <div className={styles.toolbar}>
          <p className={styles.note}>보관 기간 미정 · 자동 삭제 없음</p>
          <button type="button" className={actionClasses("secondary")} onClick={reading ? controller.cancel : () => { void controller.refresh(); }}>
            {reading ? "읽기 취소" : "보관함 새로고침"}</button>
        </div>}
        {state.phase === "loading" && <StatusNotice state="pending" title="보관 기록을 읽고 있어요." />}
        {state.phase === "cancelled" && <StatusNotice state="attention" title="읽기를 취소했어요." />}
        {state.phase === "error" && <StatusNotice state="attention" role="alert" title="보관함을 읽지 못했어요."
          detail={state.issue === "permission" ? "연결 관리에서 읽기 권한을 확인해 주세요." : "목록을 새로고침하거나 보관함 연결을 확인해 주세요."} />}
        {restoring ? <RecoveryRestoreView controller={restore} state={restoreState} picker={picker} folderName={source.view?.folderName ?? "자료 폴더"} />
          : <RecoveryArchiveView state={state} controller={controller} />}
      </section>}
    </dialog>
  </>;
}

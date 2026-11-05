"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { actionClasses } from "../../../../components/ui/action-classes";
import { managedMessages } from "../../lib/managed-files";
import type { ManagedFilesController } from "../../store/managed-files-controller";
import { DestinationFolderPicker } from "../plan/DestinationFolderPicker";
import { ManagedArchivesView } from "./ManagedArchivesView";
import { ManagedOperationView } from "./ManagedOperationView";
import dialogStyles from "../connection/source-folder-settings-dialog.module.css";
import styles from "./managed-files.module.css";
import { WorkflowStepper } from "../../../../components/ui/WorkflowStepper";
import { managedSteps } from "../../lib/workflow-steps";
import { useWorkflowUrl } from "../../hooks/use-workflow-url";
import { FileOperationHeader } from "../plan/FileOperationHeader";
import planStyles from "../plan/file-change-plan.module.css";

const titles = { copy: "파일·폴더 복사", move: "파일·폴더 이동", trash: "휴지통으로 보내기", edit: "문서 편집", recover: "보존본 복구" };
export function ManagedFilesDialog({ controller, folderName, disabled, onChanged }: {
  controller: ManagedFilesController; folderName: string; disabled: boolean; onChanged: () => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const url = useWorkflowUrl("managed");
  const picker = useSyncExternalStore(controller.picker.subscribe, controller.picker.getSnapshot, controller.picker.getServerSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const notified = useRef<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const id = useId();
  const planning = state.mode === "operation" && (state.request?.kind === "copy" || state.request?.kind === "move");
  const wasPicking = useRef(picker.open);
  useEffect(() => {
    if (wasPicking.current && !picker.open) {
      dialog.current?.querySelector<HTMLButtonElement>('[aria-label="목적지 선택"]')?.focus({ preventScroll: true });
    }
    wasPicking.current = picker.open;
  }, [picker.open]);
  useEffect(() => {
    if (!state.open) { dialog.current?.close(); return; }
    if (!dialog.current?.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current?.showModal();
      title.current?.focus();
    }
  }, [state.open]);
  useEffect(() => { if (disabled) controller.dispose(); }, [disabled, controller]);
  useEffect(() => {
    if (state.result && state.phase !== "running" && notified.current !== state.result.id) {
      notified.current = state.result.id;
      onChanged();
    }
  }, [state.result, state.phase, onChanged]);
  const close = (discard = false) => {
    if (!discard && state.editor && state.editor.text !== state.text && !["completed", "running"].includes(state.phase)) {
      setDiscarding(true);
      return;
    }
    if (controller.close()) {
      dialog.current?.close();
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    }
  };
  return <dialog ref={dialog} className={planning ? planStyles.dialog : dialogStyles.dialog} aria-labelledby={id}
    onClose={() => { setDiscarding(false); if (!dialog.current?.open && controller.getSnapshot().open) controller.close(); }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (picker.open) controller.picker.close(); else close(); }}>
    {state.open && <section data-managed-dialog-phase={state.phase}>
      {planning ? <FileOperationHeader title={titles[state.request!.kind]} titleId={id} titleRef={title}
        description={state.request!.kind === "copy" ? "원본은 그대로 두고, 선택한 폴더에 복사합니다." : "원본을 보존하고 목적지를 검증한 뒤 이동합니다."}
        source={[folderName, ...state.request!.source]} count={state.request!.names.length} steps={managedSteps} current={url.step}
        onClose={() => close()} closeLabel={state.phase === "running" ? "작업 중단" : "계획 닫기"} closeAriaLabel="파일 작업 닫기" />
        : <div className={dialogStyles.header}><h2 id={id} ref={title} tabIndex={-1}>{state.mode === "archives" ? "휴지통·보존 기록" : titles[state.request!.kind]}</h2>
        <button type="button" aria-label="파일 작업 닫기" className={actionClasses("ghost")} onClick={() => close()}>{state.phase === "running" ? "작업 중단" : "닫기"}</button></div>
      }
      {!planning && state.mode === "operation" && state.request?.kind !== "edit" && <WorkflowStepper steps={managedSteps} current={url.step} />}
      {discarding ? <>
        <StatusNotice state="attention" title="저장하지 않은 편집 내용이 있습니다." />
        <div className={styles.actions}><button type="button" className={actionClasses("primary")} onClick={() => setDiscarding(false)}>계속 편집</button>
          <button type="button" className={actionClasses("secondary")} onClick={() => close(true)}>편집 내용 버리고 닫기</button></div>
      </> : <>
        {(state.phase === "loading" || state.phase === "preparing") && <StatusNotice state="pending" title="내용과 작업 범위를 확인하고 있습니다." />}
        {state.issue && <StatusNotice state="attention" role="alert" title={managedMessages[state.issue] ?? managedMessages["managed-failed"]} />}
        {state.mode === "archives" ? <><button type="button" className={actionClasses("secondary")} disabled={state.phase === "loading"} onClick={() => { void controller.showArchives(); }}>보존 기록 새로고침</button><ManagedArchivesView controller={controller} state={state} /></>
          : picker.open ? <DestinationFolderPicker controller={controller.picker} state={picker} folderName={folderName} onChoose={() => { void controller.choose(); }} />
            : <ManagedOperationView controller={controller} state={state} folderName={folderName} />}
      </>}
    </section>}
  </dialog>;
}

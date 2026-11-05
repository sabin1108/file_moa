"use client";

/** native dialog의 초점/열림을 store와 연결한다. 입력은 store, 결과 표시는 FileChangePlanView가 맡는다. */
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { PlanReadIssue, SourcePlanController } from "../../store/source-plan-controller";
import { FileChangePlanView } from "./FileChangePlanView";
import { DestinationFolderPicker } from "./DestinationFolderPicker";
import { CopyInspectionView } from "./CopyInspectionView";
import { CopyExecutionView } from "./CopyExecutionView";
import { usePlanDialogScroll } from "../../hooks/use-plan-dialog-scroll";
import { PlanDestinationInput } from "./PlanDestinationInput";
import styles from "./file-change-plan.module.css";
import { conflictingBackupPlan } from "../../lib/recovery-backup";
import { RecoveryBackupView } from "./RecoveryBackupView";
import { FileOperationHeader } from "./FileOperationHeader";
import { copySteps } from "../../lib/workflow-steps";
import { useWorkflowUrl } from "../../hooks/use-workflow-url";

const errors: Record<PlanReadIssue, string> = {
  "invalid-plan-path": "연결 폴더 안의 상대 경로를 입력해 주세요. /로 구분하고 .. 또는 절대 경로는 사용할 수 없습니다.",
  "source-changed": "선택한 파일을 다시 확인하지 못했어요. 계획을 닫고 목록을 새로고침해 주세요.",
  missing: "출발지 또는 목적지 폴더를 찾지 못했어요. 기존 폴더의 경로를 확인해 주세요.",
  read: "계획에 필요한 목록을 읽지 못했어요. 폴더 상태를 확인하고 다시 시도해 주세요.",
};

export function SourcePlanDialog({ controller, folderName, vaultName, onCopied, onMove }: {
  controller: SourcePlanController;
  folderName: string;
  vaultName: string;
  onCopied: (path: readonly string[]) => void;
  onMove?: () => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const url = useWorkflowUrl("copy");
  const execution = useSyncExternalStore(controller.execution.subscribe, controller.execution.getSnapshot, controller.execution.getServerSnapshot);
  const inspection = useSyncExternalStore(controller.inspection.subscribe, controller.inspection.getSnapshot, controller.inspection.getServerSnapshot);
  const picker = useSyncExternalStore(controller.destinationPicker.subscribe, controller.destinationPicker.getSnapshot, controller.destinationPicker.getServerSnapshot);
  const backup = useSyncExternalStore(controller.backup.subscribe, controller.backup.getSnapshot, controller.backup.getServerSnapshot);
  const browse = useRef<HTMLButtonElement>(null);
  const previousPickerOpen = useRef(picker.open);
  const dialog = useRef<HTMLDialogElement>(null);
  usePlanDialogScroll(dialog, state.open, picker.open);
  const title = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const pickerId = useId();
  const executionStarted = execution.running || execution.result !== null || execution.issue;
  const backupActive = backup.phase !== "idle";
  const step = backupActive ? 4 : executionStarted ? 3 : inspection.phase !== "idle" ? 2 : 1;
  const previousStep = useRef(step);
  const completed = execution.result?.phase === "completed" && execution.result.journalComplete && !execution.running;
  const previousPhase = useRef(state.phase);
  useEffect(() => {
    const element = dialog.current;

    if (state.open && element && !element.open) {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      title.current?.focus();
    } else if (!state.open && element?.open) {
      element.close();

      if (trigger.current?.isConnected && !trigger.current.matches(":disabled")) {
        trigger.current.focus({ preventScroll: true });
      }
    }
  }, [state.open]);
  useEffect(() => {
    if (state.open && previousPhase.current === "loading" && state.phase !== "loading"
      && (document.activeElement === document.body || document.activeElement === dialog.current)) {
      title.current?.focus({ preventScroll: true });
    }

    previousPhase.current = state.phase;
  }, [state.open, state.phase]);
  useEffect(() => () => controller.close(), [controller]);
  useEffect(() => {
    if (state.open && previousStep.current !== step) {
      title.current?.focus({ preventScroll: true });

      if (dialog.current) {
        dialog.current.scrollTop = 0;
      }
    }

    previousStep.current = step;
  }, [state.open, step]);
  useEffect(() => {
    if (previousPickerOpen.current && !picker.open && state.open) {
      browse.current?.focus();
    }

    previousPickerOpen.current = picker.open;
  }, [picker.open, state.open]);

  return <dialog
    ref={dialog}
    className={styles.dialog}
    aria-labelledby={titleId}
    data-plan-phase={state.phase}
    data-work-step={step}
    onKeyDown={event => {
      if (event.key !== "Tab") {
        return;
      }
      // native modal의 배경 inert에 더해, 새 탐색 조작을 포함한 첫/마지막 Tab 경계를 명시한다.

      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, a[href], [tabindex]")]
        .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);

      if (!first || !last) {
        event.preventDefault();
        title.current?.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }}
    onCancel={event => {
      event.preventDefault();

      if (picker.open) {
        controller.destinationPicker.close();
      } else {
        controller.close();
      }
    }}
    onClose={() => {
      if (!dialog.current?.open) {
        controller.close();
      }
    }}
  >
    {state.open && <>
      <FileOperationHeader title={backupActive ? backup.mode === "overwrite" ? "파일 덮어쓰기" : "복구 사본 만들기" : state.operation === "copy" ? "파일 복사" : "파일 이동"}
        titleId={titleId} titleRef={title} description={backupActive ? backup.mode === "overwrite" ? "기존 목적지 파일을 복구 사본으로 남기고 새 내용으로 바꿉니다." : "기존 목적지 파일의 복구 사본을 만듭니다." : "원본은 그대로 두고, 선택한 폴더에 복사합니다."}
        source={[folderName, ...state.sourcePath]} count={state.selectedNames.length} steps={copySteps} current={url.step}
        onClose={controller.close} closeLabel={backup.phase === "running" ? backup.mode === "overwrite" ? "덮어쓰기 중단" : "백업 중단" : execution.running ? "복사 중단" : "계획 닫기"} />
      {state.resumedOutcome && <section aria-label="복원한 작업 결과">
        <StatusNotice state={state.resumedOutcome.status === "verified" ? "success" : "attention"}
          title={state.resumedOutcome.phase === "completed" ? "저장된 완료 결과를 복원했습니다." : "저장된 중단·실패 결과를 복원했습니다."}
          detail={`목적지 검증 ${state.resumedOutcome.copied}개. 현재 파일 상태는 작업 기록에서 별도로 확인하세요.`} />
        <button type="button" className={actionClasses("secondary")} onClick={controller.cancel}>새 검사 시작</button>
      </section>}
      <div
        id={pickerId}
        className={styles.stage}
        hidden={!picker.open}
      >{picker.open && <DestinationFolderPicker
        controller={controller.destinationPicker}
        state={picker}
        folderName={folderName}
        onChoose={controller.chooseDestination}
      />}</div>
      <div className={styles.stage} hidden={picker.open || !!state.resumedOutcome}>
        {step === 1 && <>
          <PlanDestinationInput
            state={state}
            controller={controller}
            folderName={folderName}
            buttonRef={browse}
            pickerId={pickerId}
            onMove={onMove}
          />
          <div aria-busy={state.phase === "loading"}>
            <p className={styles.planReadStatus} role="status">
              {state.phase === "loading" ? state.result ? "이전 계획을 표시하고 있어요. 출발지와 목적지를 다시 확인하고 있습니다." : "출발지와 목적지 목록을 확인하고 있어요." : ""}
            </p>
            {state.issue && <StatusNotice state="error" title={errors[state.issue]} />}
            {state.result && <FileChangePlanView plan={state.result} folderName={folderName} />}
            {state.result && conflictingBackupPlan(state.result) && <RecoveryBackupView
              controller={controller.backup}
              state={backup}
              inspect={controller.inspectBackup}
              folderName={folderName}
              vaultName={vaultName}
              disabled={state.phase !== "ready"}
            />}
            {state.result?.operation === "copy" && state.result.conflictCount === 0 && <div className={styles.nextAction}>
              <p>이 위치가 맞으면 파일 내용과 이름 충돌을 검사합니다.</p>
              <button
                type="button"
                className={actionClasses("primary")}
                disabled={state.phase !== "ready"}
                onClick={() => void controller.inspectCopy()}
              >복사 전 검사</button>
            </div>}
          </div>
        </>}
        {step === 4 && <RecoveryBackupView
          controller={controller.backup}
          state={backup}
          inspect={controller.inspectBackup}
          folderName={folderName}
          vaultName={vaultName}
        />}
        {step === 2 && <>
          <div className={styles.stepSummary}><p><strong>도착 위치:</strong> {[folderName, state.destination].filter(Boolean).join(" / ")}</p>
            <button
              type="button"
              className={actionClasses("secondary")}
              onClick={controller.cancel}
            >목적지·계획 수정</button></div>
          <CopyInspectionView controller={controller.inspection} inspect={controller.inspectCopy} />
          {inspection.result && <CopyExecutionView
            {...execution}
            start={() => void controller.executeCopy()}
            cancel={controller.execution.cancel}
          />}
        </>}
        {step === 3 && <>
          <CopyExecutionView
            {...execution}
            start={() => void controller.executeCopy()}
            cancel={controller.execution.cancel}
          />
          {state.result && (completed
            ? <details className={styles.inspectionDetails}><summary>검토한 계획</summary><FileChangePlanView
              plan={state.result}
              folderName={folderName}
              executionStarted
            /></details>
            : <FileChangePlanView
              plan={state.result}
              folderName={folderName}
              executionStarted
            />)}
          {completed ? <div className={styles.nextAction}>
            <p>{[folderName, state.destination].filter(Boolean).join(" / ")}에서 복사한 파일을 확인하세요.</p>
            <button
              type="button"
              className={actionClasses("primary")}
              onClick={() => {
                const destination = controller.completeCopy();

                if (destination) {
                  trigger.current = null;
                  onCopied(destination);
                }
              }}
            >확인</button>
          </div> : !execution.running && <div className={styles.actions}>
            {execution.issue && !execution.result && <button
              type="button"
              className={actionClasses("primary")}
              onClick={controller.cancel}
            >계획·검사 다시 확인</button>}
            <button
              type="button"
              className={actionClasses("secondary")}
              onClick={controller.close}
            >결과 닫기</button>
          </div>}
        </>}
      </div>
    </>}
  </dialog>;
}

"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import { DestinationFolderPicker } from "../destination-picker/DestinationFolderPicker";
import { ManagedFilesDialog } from "../operations/managed/ManagedFilesDialog";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import type { OrganizationPreparationState } from "./organization-preparation-controller";
import styles from "./organization-preparation.module.css";
import { hasUnansweredReview } from "../../../shared/live-organization-review";
import { FileChangeComparison } from "../operations/FileChangeComparison";
import { SelectionWorkspaceDialog } from "../destination-picker/SelectionWorkspaceDialog";
import { managedWorkflowStep } from "../operations/managed/managed-workflow-step";

export function OrganizationExecutionPanel({
  preparation,
}: {
  preparation: OrganizationPreparationState;
}) {
  const connection = useSharedSourceFolderConnection();
  const controller = connection.organizationExecution;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const picker = useSyncExternalStore(
    controller.picker.subscribe,
    controller.picker.getSnapshot,
    controller.picker.getServerSnapshot,
  );
  const managed = useSyncExternalStore(
    controller.managed.subscribe,
    controller.managed.getSnapshot,
    controller.managed.getServerSnapshot,
  );
  const folderName = connection.state.view?.folderName ?? "내 폴더";
  const running = managed.phase === "running" || ["reading", "checking", "sending"].includes(preparation.phase);
  const step = managedWorkflowStep(managed);
  const settingsSummary = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.batches.length) settingsSummary.current?.focus({ preventScroll: true });
  }, [state.batches.length]);

  return (
    <>
      {preparation.result &&
        !hasUnansweredReview(preparation.questions, preparation.answers)
        &&
        !preparation.result.organization.held.length
        && (
          <section
            className={styles.snapshot}
            aria-label="AI 제안 실제 작업 검토"
            data-organization-operation
          >
            <h3>변경 계획</h3>
            <p>
              {preparation.result.organization.matches.length}개 자료의 도착 위치를 확인하세요.
              복사·이동을 고르고 묶음별 검사 후 직접 승인합니다.
            </p>
            {picker.open
              ? (
                <SelectionWorkspaceDialog title="실제 목적지 선택" onClose={controller.picker.close}><DestinationFolderPicker
                  hideHeader
                  controller={controller.picker}
                  state={picker}
                  folderName={folderName}
                  onChoose={controller.choose}
                  onCancel={controller.picker.close}
                /></SelectionWorkspaceDialog>
              )
              : (
                <>
                  <details open={!state.batches.length} className={styles.executionSettings}>
                    <summary ref={settingsSummary}>
                      {state.batches.length
                        ? `${state.operation === "copy" ? "복사" : "이동"} · ${[folderName, ...(state.base ?? [])].join(" / ")} · 설정 변경`
                        : "복사·이동과 목적지 선택"}
                    </summary>
                  <fieldset className={styles.operationChoices} disabled={running || state.stale}>
                    <legend>적용할 작업</legend>
                    {(["copy", "move"] as const).map((kind) => (
                      <label key={kind} className={styles.check}>
                        <input
                          type="radio"
                          name="organization-operation"
                          data-organization-kind={kind}
                          checked={state.operation === kind}
                          onChange={() => controller.setOperation(kind)}
                        />
                        {kind === "copy"
                          ? "원본을 유지하고 복사"
                          : "보존 후 이동"}
                      </label>
                    ))}
                  </fieldset>
                  <p>
                    실제 목적지:{" "}
                    {state.base === null
                      ? "선택 필요"
                      : [folderName, ...state.base].join(" / ")}
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={actionClasses("secondary")}
                      disabled={running || state.stale}
                      onClick={() => void controller.browse()}
                    >
                      실제 목적지 선택
                    </button>
                    <button
                      type="button"
                      data-organization-plan
                      className={actionClasses("primary")}
                      disabled={
                        running ||
                        state.stale ||
                        !state.operation
                        ||
                        state.base === null
                      }
                      onClick={controller.review}
                    >
                      작업 계획 검토
                    </button>
                  </div>
                  </details>
                  <FileChangeComparison
                    rootName={folderName}
                    operation={state.operation}
                    changes={preparation.result!.organization.matches.flatMap(
                      (match) => {
                        const document = preparation.snapshot?.documents.find(
                          (document) => document.id === match.documentId,
                        );

                        return document && state.base !== null
                          ? [
                            {
                              from: document.path,
                              to: [
                                ...state.base,
                                ...match.destination,
                                document.name,
                              ],
                              kind: "file" as const,
                            },
                          ]
                          : [];
                      },
                    )}
                  />
                  <p className={styles.note}>
                    제안 하위 폴더가 없으면 묶음의 목적지 선택에서 공통 새 폴더
                    만들기로 생성하고 선택할 수 있습니다. 폴더 생성도 별도 명시
                    동작이며 자동 실행하지 않습니다.
                  </p>
                  {state.batches.length > 0 && <h4>검토할 작업 {state.batches.length}개</h4>}
                  <ol className={styles.batchList} aria-label="목적지별 작업">
                    {state.batches.map((batch, index) => {
                      const outcome = state.outcomes.find(
                        (outcome) => outcome.key === batch.key,
                      );

                      return (
                        <li key={batch.key}>
                          <div className={styles.batchHeading}><strong>
                            {(
                              outcome?.destination ?? batch.request.destination
                            ).join(" / ") || folderName}
                          </strong><span>{batch.request.names.length}개 파일</span></div>
                          <details>
                            <summary>포함 파일 보기</summary>
                            <p>현재 위치: {[folderName, ...batch.request.source].join(" / ")}</p>
                            <ul>{batch.request.names.map(name => <li key={name}>{name}</li>)}</ul>
                          </details>
                          {outcome
                            && (
                              <p>
                                {outcome.result.phase === "completed"
                                  ? "완료"
                                  : outcome.result.phase === "cancelled"
                                    ? "중단"
                                    : "일부 실패/확인 필요"}{" "}
                                · 복사 {outcome.result.copied} / 원본 처리{" "}
                                {outcome.result.removed}
                              </p>
                            )}
                          <button
                            type="button"
                            className={actionClasses("secondary")}
                            disabled={
                              running ||
                              state.stale
                              ||
                              outcome?.result.phase === "completed"
                            }
                            data-organization-batch={index}
                            onClick={() => void controller.openBatch(batch.key)}
                          >
                            묶음 {index + 1} 검토
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            {state.issue && (
              <StatusNotice state="attention" title={state.issue} />
            )}
          </section>
        )}
      <div className={styles.actions}>
        <button
          type="button"
          className={actionClasses("ghost")}
          disabled={running || connection.recoveryView.status !== "connected"}
          onClick={() => void controller.showArchives()}
        >
          보존 기록·복구 열기
        </button>
      </div>
      <ManagedFilesDialog
        controller={controller.managed}
        folderName={folderName}
        step={step}
        returnLabel="정리 화면으로 돌아가기"
        disabled={connection.state.view?.status !== "connected"}
        onChanged={() => void connection.listing.refresh()}
      />
    </>
  );
}

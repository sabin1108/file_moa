"use client";
import { useSyncExternalStore } from "react";
import { useSharedSourceFolderConnection } from "../../providers/SourceFolderProvider";
import { DestinationFolderPicker } from "../plan/DestinationFolderPicker";
import { ManagedFilesDialog } from "../managed/ManagedFilesDialog";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { OrganizationPreparationState } from "../../store/organization-preparation-controller";
import styles from "./organization-preparation.module.css";
import { hasUnansweredReview } from "../../../../shared/live-organization-review";
import { FileChangeComparison } from "../plan/FileChangeComparison";

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
  const running = managed.phase === "running";
  const step = running
    ? managed.result?.phase === "preserving"
      ? "preserve"
      : "execute"
    : managed.result
      ? "result"
      : managed.preview
        ? "review"
        : "destination";
  return (
    <>
      {preparation.result &&
        !hasUnansweredReview(preparation.questions, preparation.answers) &&
        !preparation.result.organization.held.length && (
          <section
            className={styles.snapshot}
            aria-label="AI 제안 실제 작업 검토"
            data-organization-operation
          >
            <h3>제안을 실제 작업 계획으로 검토</h3>
            <p>
              복사/이동과 실제 목적지를 선택해 주세요. 파일을 바꾸려면 묶음별로
              기존 검사와 실행 승인을 거칩니다.
            </p>
            {picker.open ? (
              <DestinationFolderPicker
                controller={controller.picker}
                state={picker}
                folderName={folderName}
                onChoose={controller.choose}
                onCancel={controller.picker.close}
              />
            ) : (
              <>
                <fieldset disabled={running || state.stale}>
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
                      !state.operation ||
                      state.base === null
                    }
                    onClick={controller.review}
                  >
                    작업 계획 검토
                  </button>
                </div>
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
                <ol>
                  {state.batches.map((batch, index) => {
                    const outcome = state.outcomes.find(
                      (outcome) => outcome.key === batch.key,
                    );
                    return (
                      <li key={batch.key}>
                        <p>
                          {batch.request.source.join(" / ") || folderName} ·{" "}
                          {batch.request.names.join(", ")} →{" "}
                          {(
                            outcome?.destination ?? batch.request.destination
                          ).join(" / ")}
                        </p>
                        {outcome && (
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
                            state.stale ||
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
        disabled={connection.state.view?.status !== "connected"}
        onChanged={() => void connection.listing.refresh()}
      />
    </>
  );
}

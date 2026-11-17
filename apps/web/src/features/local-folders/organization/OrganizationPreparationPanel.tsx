"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import { DestinationFolderPicker } from "../destination-picker/DestinationFolderPicker";
import { OrganizationSnapshotView } from "./OrganizationSnapshotView";
import styles from "./organization-preparation.module.css";
import type { LiveOrganizationAction } from "../../../shared/live-organization";
import { OrganizationResultView } from "./OrganizationResultView";
import { OrganizationQuestionsView } from "./OrganizationQuestionsView";
import { OrganizationExecutionPanel } from "./OrganizationExecutionPanel";
import { SelectionWorkspaceDialog } from "../destination-picker/SelectionWorkspaceDialog";
import type { AiProvider } from "../../../shared/ai-provider";
import { hasUnansweredReview } from "../../../shared/live-organization-review";
import { OrganizationConversationView } from "./OrganizationConversationView";
import { FolderSetupNotice } from "../connection/FolderSetupNotice";

export function OrganizationPreparationPanel({
  organizeAction,
  aiProvider = "gemini",
  onReply,
}: {
  organizeAction?: LiveOrganizationAction;
  aiProvider?: AiProvider | null;
  onReply?: (text: string) => void;
}) {
  const [assignment, setAssignment] = useState("same");
  const heading = useRef<HTMLHeadingElement>(null);
  const {
    state: connection,
    organization: controller,
    listing,
  } = useSharedSourceFolderConnection();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const files = useSyncExternalStore(
    listing.subscribe,
    listing.getSnapshot,
    listing.getServerSnapshot,
  );
  const picker = useSyncExternalStore(
    controller.picker.subscribe,
    controller.picker.getSnapshot,
    controller.picker.getServerSnapshot,
  );
  const folderName = connection.view?.folderName ?? "내 폴더";
  const reading = ["reading", "checking", "sending"].includes(state.phase);
  const purpose =
    state.picking === "scope"
      ? "탐색 범위"
      : state.picking === "reference"
        ? "참고"
        : "목적지";
  const questioning = state.questions.length > 0 && !state.reviewConfirmed;
  const planning = !!state.result && !state.result.organization.held.length && !questioning;
  useEffect(() => {
    if (!picker.open && state.snapshot) heading.current?.focus({ preventScroll: true });
  }, [picker.open, questioning, planning, state.snapshot]);

  if (state.purpose === "grounded") return null;

  if (picker.open && state.picking)
    return (<SelectionWorkspaceDialog title={`${purpose} 폴더 선택`} onClose={controller.closePicker}>
      {state.issue && <StatusNotice state="attention" title={state.issue} />}
      {state.picking === "answer" && <p className={styles.note}>최종 목적지: {[folderName, ...(state.destination ?? [])].join(" / ")} · 이 안에서 정리할 하위 폴더를 선택하세요.</p>}
      <DestinationFolderPicker
        hideHeader
        controller={controller.picker}
        state={picker}
        folderName={folderName}
        purpose={purpose}
        allowCreation={false}
        showFiles
        onChoose={controller.chooseFolder}
        onCancel={controller.closePicker}
      />
      {state.picking === "answer" && <details className={styles.conditions}>
        <summary>새 하위 폴더 이름 지정</summary>
        <form className={styles.basis} onSubmit={event => {
          event.preventDefault();
          const path = String(new FormData(event.currentTarget).get("newDestination") ?? "").trim();
          controller.chooseAnswerFolder(path.split("/"));
        }}>
          <label>최종 목적지 아래에 만들 폴더 경로<input name="newDestination" maxLength={120} required placeholder="예: 영어/웹 개발" /></label>
          <p className={styles.note}>지금 파일을 만들거나 옮기지 않습니다. 변경 계획에서 다시 확인합니다.</p>
          <button type="submit" className={actionClasses("secondary")}>이 경로로 지정</button>
        </form>
      </details>}
      </SelectionWorkspaceDialog>
    );

  return (
    <div className={styles.preparation} data-local-preparation>
      <FolderSetupNotice />
      <header>
        <h2 ref={heading} tabIndex={-1} className="sr-only">{questioning ? "확인이 필요한 자료 지정" : planning ? "변경 계획 확인" : "정리 내용 확인"}</h2>
        <Link href="/files">내 파일 열기</Link>
        {state.conversationStep && state.conversationStep !== "scope" && <button type="button" disabled={reading} className={actionClasses("ghost")} onClick={controller.backConversation}>이전 질문</button>}
      </header>

      {reading
        && (
          <button
            type="button"
            className={actionClasses("secondary")}
            onClick={controller.cancel}
          >
            {state.phase === "sending"
              ? "응답 대기 중지"
              : state.phase === "checking"
                ? "전송 준비 중지"
                : "자료 읽기 중지"}
          </button>
        )}
      {state.issue
        && (
          <StatusNotice
            state={state.phase === "error" ? "error" : "attention"}
            title={state.issue}
          />
        )}
      {planning ? <>
        {state.questions.length > 0 && <button type="button" data-edit-review className={actionClasses("ghost")} onClick={controller.editReview}>분류 기준 수정</button>}
        <OrganizationExecutionPanel preparation={state} />
        <details><summary>제안 근거·모델 정보</summary><OrganizationResultView state={state} /></details>
      </> : <>
        <OrganizationConversationView state={state} files={files} folderName={folderName} onReply={onReply} onChooseFolder={() => void controller.browse(state.conversationStep === "destination" ? "destination" : "scope")} />
        {state.snapshot && !questioning && <OrganizationSnapshotView folderName={folderName} controller={controller} state={state} organizeAction={organizeAction} aiProvider={aiProvider} />}
        {questioning &&
        <details key={questioning ? "questions" : state.snapshot ? "snapshot" : "conditions"} className={styles.manualReview}>
          <summary>파일별로 직접 지정</summary>
            <OrganizationQuestionsView controller={controller} state={state} assignment={assignment} onAssignment={setAssignment} />
            <button type="button" data-confirm-review className={actionClasses("secondary")} disabled={reading || hasUnansweredReview(state.questions, state.answers)} onClick={controller.confirmReview}>지정 완료</button>
        </details>}
      </>}
    </div>
  );
}

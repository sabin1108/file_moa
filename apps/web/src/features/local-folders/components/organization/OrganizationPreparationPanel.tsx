"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { useSharedSourceFolderConnection } from "../../providers/SourceFolderProvider";
import { DestinationFolderPicker } from "../plan/DestinationFolderPicker";
import { OrganizationSnapshotView } from "./OrganizationSnapshotView";
import styles from "./organization-preparation.module.css";
import type { LiveOrganizationAction } from "../../../../shared/live-organization";
import { OrganizationResultView } from "./OrganizationResultView";
import { OrganizationQuestionsView } from "./OrganizationQuestionsView";
import { OrganizationExecutionPanel } from "./OrganizationExecutionPanel";
import { OrganizationConditionsView } from "./OrganizationConditionsView";
import type { AiProvider } from "../../../../shared/ai-provider";

export function OrganizationPreparationPanel({
  organizeAction,
  aiProvider = "gemini",
}: {
  organizeAction?: LiveOrganizationAction;
  aiProvider?: AiProvider | null;
}) {
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

  if (picker.open && state.picking)
    return (
      <DestinationFolderPicker
        controller={controller.picker}
        state={picker}
        folderName={folderName}
        purpose={purpose}
        allowCreation={false}
        onChoose={controller.chooseFolder}
        onCancel={controller.closePicker}
      />
    );

  return (
    <div className={styles.preparation} data-local-preparation>
      <header>
        <h2 className="sr-only">정리 내용 확인</h2>
        <Link href="/files">내 파일 열기</Link>
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
      <OrganizationQuestionsView controller={controller} state={state} />
      <OrganizationSnapshotView
        key={state.snapshot ? "ready" : "empty"}
        folderName={folderName}
        controller={controller}
        state={state}
        organizeAction={organizeAction}
        aiProvider={aiProvider}
      />
      <OrganizationResultView state={state} />
      <OrganizationExecutionPanel preparation={state} />
      <OrganizationConditionsView
        controller={controller}
        state={state}
        files={files}
        folderName={folderName}
      />
    </div>
  );
}

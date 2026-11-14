"use client";

import { useEffect, useRef } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { RecoveryRestoreController, RecoveryRestoreState } from "./recovery-restore-controller";
import type { DestinationPickerState } from "../../destination-picker/destination-picker-controller";
import { DestinationFolderPicker } from "../../destination-picker/DestinationFolderPicker";
import styles from "../../history/folder-history.module.css";

const statuses = { "not-run": "미실행", uncertain: "확인 필요", verified: "복원 검증됨" };
const issues = {
  interrupted: "복원 위치는 복구했습니다. 중단된 실행은 자동으로 반복하지 않으니 기록과 남은 파일을 확인한 뒤 다시 검사해 주세요.",
  permission: "폴더와 보관함의 접근 권한을 확인해 주세요.",
  source: "보관함의 사본 또는 기록이 바뀌었습니다. 보관함에서 다시 확인해 주세요.",
  destination: "복원 위치나 파일 이름을 사용할 수 없습니다. 다른 위치를 선택해 주세요.",
  read: "복원 준비를 마치지 못했습니다. 사본과 위치를 다시 확인해 주세요.",
};

export function RecoveryRestoreView({ controller, state, picker, folderName }: {
  controller: RecoveryRestoreController;
  state: RecoveryRestoreState;
  picker: DestinationPickerState;
  folderName: string;
}) {
  const stop = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const running = state.phase === "running";

  useEffect(() => {
    if (state.phase === "ready") stop.current?.focus({ preventScroll: true });
    else if (!picker.open) title.current?.focus({ preventScroll: true });
  }, [state.phase, picker.open]);

  if (picker.open) return <section aria-label="복원 위치 선택" data-restore-phase={state.phase}>
    <p className={styles.note}>연결된 자료 폴더 안의 기존 폴더를 고르세요.</p>
    <DestinationFolderPicker
      controller={controller.picker}
      state={picker}
      folderName={folderName}
      onChoose={() => {
        void controller.chooseDestination();
      }}
    />
  </section>;

  return <section aria-label="복구 사본 복원" data-restore-phase={state.phase}>
    <h3 ref={title} tabIndex={-1}>
      {state.phase === "ready" ? "이 위치에 복원할까요?" : running ? "파일 복원 중" : "복원 결과"}
    </h3>
    {state.phase === "preparing" && <StatusNotice state="pending" title="사본과 복원 위치를 확인하고 있어요." />}
    {state.phase === "choosing" && <p className={styles.note}>복원할 위치를 선택해 주세요.</p>}
    {state.phase === "ready" && <StatusNotice
      state="attention"
      title="새 파일로 복원합니다."
      detail="기존 파일과 보관본은 유지합니다. 실행 직전에 사본과 이름 충돌을 다시 확인합니다."
    />}
    {state.preview && <div className={styles.list}>
      <dl>
        <dt>원래 파일명</dt>
        <dd>
          {state.preview.originalName}
        </dd>
        <dt>복원 위치</dt>
        <dd>
          {[folderName, ...state.preview.destination].join(" / ")}
        </dd>
        <dt>복원 파일명</dt>
        <dd>
          {state.preview.name}
        </dd>
        <dt>용량</dt>
        <dd>{state.preview.size.toLocaleString("ko-KR")} bytes</dd>
      </dl>
    </div>}
    {state.preview?.renamed && <p className={styles.note}>같은 이름이 있어 새 이름으로 복원합니다.</p>}
    {running && <p role="status">
      {state.cancelling ? "중단을 처리하고 있습니다. 결과를 기다려 주세요." : "사본을 새 파일로 복원하고 다시 읽어 확인하고 있어요."}
    </p>}
    {!running && state.result && <>
      <StatusNotice
        state={state.phase === "completed" ? "success" : "attention"}
        role={state.phase === "completed" ? "status" : "alert"}
        title={state.phase === "completed" ? "파일을 복원하고 검증했습니다." : state.phase === "cancelled" ? "복원을 중단했습니다." : "복원을 완료하지 못했습니다."}
        detail={state.phase === "completed" ? "기존 파일과 보관본은 그대로 남아 있습니다." : "결과를 확인한 뒤 다시 검사해 주세요. 일부 새 파일이 남아 있을 수 있습니다."}
      />
      <div className={styles.list}>
        <dl>
          <dt>파일 상태</dt>
          <dd>
            {statuses[state.result.status]}
          </dd>
          <dt>위치</dt>
          <dd>
            {[folderName, ...state.result.path].join(" / ")}
          </dd>
        </dl>
      </div>
      {!state.result.journalComplete && <p className={styles.note}>작업 기록을 완전히 확인하지 못했습니다.</p>}
    </>}
    {state.issue && !state.result && <StatusNotice state="attention" role="alert" title={issues[state.issue]} />}
    <div className={styles.toolbar}>
      {state.phase === "ready" && <>
        <button ref={stop} type="button" className={actionClasses("secondary")} onClick={controller.reset}>복원 취소</button>
        <button
          type="button"
          className={actionClasses("primary")}
          onClick={() => {
            void controller.start();
          }}
        >이 위치에 복원</button>
      </>}
      {running && <button
        type="button"
        className={actionClasses("secondary")}
        disabled={state.cancelling}
        onClick={controller.cancel}
      >복원 중단</button>}
      {!running && state.phase !== "preparing" && <button
        type="button"
        className={actionClasses("secondary")}
        onClick={() => {
          void controller.browse();
        }}
      >복원 위치 다시 선택</button>}
      {state.phase === "preparing" && <button type="button" className={actionClasses("secondary")} onClick={controller.cancel}>복원 검사 취소</button>}
      {!running && <button type="button" className={actionClasses("secondary")} onClick={controller.reset}>보관함으로 돌아가기</button>}
    </div>
  </section>;
}

"use client";

import { useEffect, useRef } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { RecoveryBackupController, RecoveryBackupState } from "./recovery-backup-controller";
import styles from "../../operations/planning/file-change-plan.module.css";

const statuses = { "not-run": "미실행", uncertain: "확인 필요", verified: "덮어쓰기 검증됨" };

/** 별도 최종 승인과 실제 교체 결과. 파일/권한 API에 직접 접근하지 않는다. */

export function RecoveryOverwriteView({ controller, state, folderName, vaultName }: {
  controller: RecoveryBackupController;
  state: RecoveryBackupState;
  folderName: string;
  vaultName: string;
}) {
  const stop = useRef<HTMLButtonElement>(null);
  const confirming = state.phase === "confirming";
  const running = state.phase === "running";

  useEffect(() => {
    if (confirming) {
      stop.current?.focus({ preventScroll: true });
      stop.current?.scrollIntoView({ block: "nearest" });
    }
  }, [confirming]);

  const total = state.report?.files.reduce((sum, file) => sum + file.source.size, 0) ?? 0;
  const completed = state.phase === "completed";

  return <section className={styles.inspection} aria-label="복구 사본 후 덮어쓰기" data-overwrite-phase={state.phase}>
    <h3>
      {confirming ? "기존 파일을 바꿀까요?" : "덮어쓰기 결과"}
    </h3>
    {confirming && <StatusNotice
      state="attention"
      title="기존 목적지 파일이 새 내용으로 바뀝니다."
      detail="실행 직전 복구 사본과 현재 파일을 다시 확인합니다. 원본은 유지합니다."
    />}
    <p>복구 보관함: {vaultName} · 보관 기간 미정 · 자동 삭제 없음</p>
    <p>덮어쓸 파일 {state.report?.files.length}개 · 새 내용 {total.toLocaleString("ko-KR")} bytes</p>
    <p>같은 이름의 충돌 파일만 처리합니다. 충돌 없는 선택 파일은 이번에 복사하지 않습니다.</p>
    <ol className={styles.rows} aria-label="덮어쓸 파일과 결과">
      {state.report?.files.map((file, index) => <li key={JSON.stringify(file.to)}>
        <strong>
          {file.to.at(-1)}
        </strong>
        <p>{[folderName, ...file.from].join(" / ")} → {[folderName, ...file.to].join(" / ")}</p>
        <p>기존 {file.target.size.toLocaleString("ko-KR")} bytes → 새 내용 {file.source.size.toLocaleString("ko-KR")} bytes</p>
        {state.overwrite?.items[index] && <p>
          {statuses[state.overwrite.items[index].status]}
        </p>}
      </li>)}
    </ol>
    {running && <p role="status">
      {state.cancelling ? "중단을 처리하고 있습니다. 파일별 결과를 기다려 주세요." : "복구 사본과 파일을 확인한 뒤 순서대로 덮어쓰고 있습니다…"}
    </p>}
    {!confirming && !running && <StatusNotice
      state={completed ? "success" : "attention"}
      role={completed ? "status" : "alert"}
      title={completed ? "덮어쓰기를 완료하고 검증했습니다." : state.phase === "cancelled" ? "덮어쓰기를 중단했습니다." : "덮어쓰기를 마치지 못했습니다."}
      detail={completed ? "기존 파일의 복구 사본은 보관함에 남아 있습니다." : "파일별 결과를 확인하세요. 확인 필요 항목은 일부 내용이 바뀌었을 수 있습니다. 복구 사본은 자동 삭제하지 않습니다."}
    />}
    {state.overwrite && !state.overwrite.journalComplete && <p>작업 기록을 완전히 확인하지 못했습니다.</p>}
    <div className={styles.actions}>
      {confirming && <>
        <button
          ref={stop}
          type="button"
          className={actionClasses("secondary")}
          onClick={controller.dismissOverwrite}
        >덮어쓰기 중단</button>
        <button
          type="button"
          className={actionClasses("primary")}
          onClick={() => {
            void controller.startOverwrite();
          }}
        >복구 사본을 남기고 덮어쓰기</button>
      </>}
      {running && <button
        type="button"
        className={actionClasses("secondary")}
        disabled={state.cancelling}
        onClick={controller.cancel}
      >덮어쓰기 중단</button>}
    </div>
  </section>;
}

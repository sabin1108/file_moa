"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { actionClasses } from "../../../../components/ui/action-classes";
import { useSharedSourceFolderConnection } from "../../providers/SourceFolderProvider";
import styles from "./source-folder-connection.module.css";
import { RecoveryArchiveDialog } from "../recovery/RecoveryArchiveDialog";

/** 설정/폴더 연결 창의 보관함 조작. 핸들 접근 없이 표시와 사용자 행동만 연결한다. */

export function RecoveryVaultSettings({ titleRef }: { titleRef?: RefObject<HTMLHeadingElement | null> }) {
  const { state, recovery, recoveryState, recoveryView, recoveryKey } = useSharedSourceFolderConnection();
  const region = useRef<HTMLElement>(null);
  const errorRegion = useRef<HTMLDivElement>(null);
  const wasPending = useRef(false);
  const [creating, setCreating] = useState(false);
  const busy = recoveryState.pending !== null;
  const available = state.phase === "ready" && state.view?.status === "connected" && !state.pending;

  useEffect(() => {
    void recovery.checkPresence();
  }, [recovery]);

  useEffect(() => () => {
    if (recovery.getSnapshot().pending) recovery.cancel();
  }, [recovery]);

  useEffect(() => {
    if (wasPending.current && !busy && document.activeElement === document.body) {
      region.current?.focus();
    }

    wasPending.current = busy;
  }, [busy]);

  useEffect(() => {
    if (recoveryState.failed) {
      errorRegion.current?.focus({ preventScroll: true });
      errorRegion.current?.scrollIntoView({ block: "nearest" });
    }
  }, [recoveryState.failed, recoveryState.message]);

  const repair = () => {
    if (recoveryState.remedy === "choose-location") {
      setCreating(true);
      void recovery.run("choose");
    } else if (recoveryState.remedy === "retry-create") {
      void recovery.run("create");
    } else {
      void recovery.run("connect");
    }
  };

  return (
    <section className={styles.vault} aria-label="복구 보관함 설정" ref={region} tabIndex={-1}>
      <h3 ref={titleRef} tabIndex={-1}>복구 보관함</h3>
      <p>
        {recoveryView.status === "connected" ? "복구 사본을 보관할 위치가 연결됐어요." : "다음으로 복구 사본을 보관할 위치를 연결하세요."}
      </p>
      <div className={styles.vaultSummary}>
        <p>{recoveryView.status === "connected" ? "연결된 보관함" : "저장된 연결"}: {recoveryView.folderName ?? "지정하지 않음"}
          {recoveryView.status === "needs-permission" && " · 다시 연결 필요"}
          {recoveryView.status === "connected" && " · 위치·식별 확인됨"}
        </p>
        <div className={styles.vaultActions} role="group" aria-label="현재 보관함 확인">
          {recoveryView.folderName && <button
            type="button"
            className={actionClasses("secondary")}
            disabled={busy || recoveryState.checking}
            onClick={() => {
              void recovery.checkPresence(false);
            }}
          >
            {recoveryState.checking ? "상태 확인 중…" : "보관함 상태 확인"}
          </button>}
          {recoveryView.status === "connected" && <RecoveryArchiveDialog key={recoveryKey} />}
        </div>
      </div>
      {!available && <p>자료 폴더를 먼저 연결해 주세요.</p>}
      <fieldset className={styles.vaultManagement}>
        <legend>보관함 연결 관리</legend>
        <div className={styles.vaultActions}>
          <button
            type="button"
            className={actionClasses("secondary")}
            disabled={!available || busy}
            onClick={() => {
              setCreating(true);
            }}
          >
            새 보관함 만들기
          </button>
          <button
            type="button"
            className={actionClasses("secondary")}
            disabled={!available || busy}
            onClick={() => {
              void recovery.run("connect");
            }}
          >
            {recoveryView.status === "connected" ? "다른 보관함 선택" : "기존 보관함 연결"}
          </button>
          {recoveryView.status !== "disconnected"
            && (
              <button
                type="button"
                className={actionClasses("secondary")}
                disabled={busy}
                onClick={() => {
                  void recovery.run("disconnect");
                }}
              >
                보관함 연결 해제
              </button>
            )}
          {busy
            && (
              <button type="button" className={actionClasses("secondary")} onClick={recovery.cancel}>
                보관함 작업 중단
              </button>
            )}
        </div>
        <p>자료 폴더 바로 아래에도 만들 수 있어요. 연결 해제는 보관된 파일을 지우지 않습니다.</p>
      </fieldset>
      {creating && <div className={styles.vaultCreation} aria-label="새 복구 보관함 생성">
        <h4>새 복구 보관함 만들기</h4>
        <p>자료 폴더 또는 바깥 위치를 고르세요. 그 바로 아래에 전용 보관함을 만듭니다.</p>
        <p>생성 위치: {recoveryState.creationParentName ?? "아직 선택하지 않음"}</p>
        <div className={styles.vaultActions}>
          <button
            type="button"
            className={actionClasses("secondary")}
            disabled={!available || busy}
            onClick={() => {
              void recovery.run("choose");
            }}
          >만들 위치 선택</button>
          <button
            type="button"
            className={actionClasses("primary")}
            disabled={!available || busy || !recoveryState.creationParentName}
            onClick={async () => {
              await recovery.run("create");

              if (!recovery.getSnapshot().failed) setCreating(false);
            }}
          >이 위치에 보관함 생성</button>
          <button
            type="button"
            className={actionClasses("secondary")}
            disabled={busy}
            onClick={() => {
              recovery.cancel();
              setCreating(false);
            }}
          >생성 취소</button>
        </div>
      </div>}
      {recoveryState.failed
        ? <div ref={errorRegion} tabIndex={-1} className={styles.recoveryError} aria-label="보관함 설정 오류">
          <StatusNotice
            state="attention"
            role="alert"
            title={recoveryState.message}
            detail={recoveryState.help}
            action={recoveryState.remedy && <button
              type="button"
              className={actionClasses("primary")}
              disabled={busy || !available}
              onClick={repair}
            >
              {recoveryState.remedy === "choose-location"
                ? "다른 위치 선택"
                : recoveryState.remedy === "retry-create" ? "권한 확인 후 다시 생성" : "기존 보관함 선택"}
            </button>}
          />
        </div>
        : <p role="status">
          {busy ? "보관함 확인 중…" : recoveryState.message}
        </p>}
      {recoveryState.diagnostic && <details>
        <summary>오류 정보</summary>
        <code>
          {recoveryState.diagnostic}
        </code>
      </details>}
      <p>백업은 복사 계획의 충돌 검사에서 실행합니다.</p>
    </section>
  );
}

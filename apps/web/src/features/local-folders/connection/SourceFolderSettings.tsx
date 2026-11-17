"use client";

/**
 * 설정 페이지와 파일 화면 팝업이 공유하는 폴더 연결 조작이다. Provider의 controller에 연결·재연결·해제를 요청한다.
 * 자료 연결 뒤 보관함 설정으로 이어가고, 완료 버튼에서 /files 이동 또는 dialog 닫기를 요청한다. 직접 파일 API나 IndexedDB를 열지 않는다.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { actionClasses } from "../../../components/ui/action-classes";
import { StatusNotice } from "../../../components/ui/feedback/StatusNotice";
import { SourceFolderConnection } from "./SourceFolderConnection";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import styles from "./source-folder-connection.module.css";
import { RecoveryVaultSettings } from "../recovery/RecoveryVaultSettings";
import { FolderPermissionGuide } from "./FolderPermissionGuide";
import { OcrControl } from "../content/ocr/OcrControl";
import { SearchIndexSettings } from "../search/documents/SearchIndexSettings";
import { SemanticModelPanel } from "../search/semantic/SemanticModelPanel";

const pendingTitles = {
  connect: "폴더 선택과 연결을 기다리고 있어요.",
  reconnect: "읽기 권한을 확인하고 있어요.",
  disconnect: "연결 정보를 지우고 있어요.",
};

export function SourceFolderSettings({ onConnected, preparationOnly = false }: { onConnected?: () => void; preparationOnly?: boolean } = {}) {
  const { state, connect, reconnect, disconnect, reload, recoveryState, recoveryView, sources, activateSource, disconnectSource, readSourceIndexStatus, refreshSourceIndex, clearSourceIndex, indexWatch, semanticModel, prepareSourceSemantic, readSourceSemanticStatus } = useSharedSourceFolderConnection();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useRef(false);
  const vaultTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const connectAndContinue = async (action: () => Promise<boolean>) => {
    const completed = await action();

    if (completed && mounted.current) {
      vaultTitle.current?.focus({ preventScroll: true });
      vaultTitle.current?.scrollIntoView({ block: "nearest" });
    }
  };
  const finish = () => {
    onConnected?.();

    if (!preparationOnly && pathname !== "/files") router.push("/files");
  };
  const region = useRef<HTMLDivElement>(null);
  const previousPending = useRef(state.pending);

  useEffect(() => {
    // A successful selection removes its button. Restore keyboard focus only if it was lost.
    const actionFinished = previousPending.current && !state.pending;
    const focusWasLost = document.activeElement === document.body;
    const regionIsVisible = region.current?.getClientRects().length;

    if (actionFinished && focusWasLost && regionIsVisible) {
      region.current?.focus();
    }

    previousPending.current = state.pending;
  }, [state.pending]);

  let retryAction;

  if (state.phase === "load-error") {
    retryAction = (
      <button type="button" className={actionClasses("secondary")} onClick={reload}>
        다시 불러오기
      </button>
    );
  } else if (state.phase === "disconnect-error") {
    retryAction = (
      <button
        type="button"
        className={actionClasses("secondary")}
        disabled={!!state.pending}
        onClick={disconnect}
      >
        연결 해제 다시 시도
      </button>
    );
  }

  return <div className={styles.settings} ref={region} tabIndex={-1} aria-label="자료 폴더 연결 설정">
    <p className={styles.scope}>
      {preparationOnly ? "연결 정보는 이 브라우저에만 저장합니다." : "로그인한 계정의 연결 · 이 브라우저에만 저장합니다."}
    </p>
    {!preparationOnly && state.view?.status !== "connected" && <FolderPermissionGuide />}
    {state.phase === "loading" && (
      <StatusNotice state="pending" title="저장된 연결 정보를 확인하고 있어요." />
    )}
    {state.view
      && (
        <SourceFolderConnection
          view={state.view}
          disabled={!!state.pending || state.phase === "disconnect-error"}
          onConnect={() => {
            void connectAndContinue(connect);
          }}
          onReconnect={() => {
            void connectAndContinue(reconnect);
          }}
          onDisconnect={disconnect}
        />
      )}
    {state.pending && <StatusNotice state="pending" title={pendingTitles[state.pending]} />}
    {state.notice && state.notice.state !== "success" && <StatusNotice {...state.notice} action={retryAction} />}
    {sources.length > 1 && <div aria-label="연결된 자료 폴더 목록">
      <p>연결된 자료 폴더</p>
      {sources.map(source => <div key={source.connectionId}>
        <span>
          {source.name}
          {source.active ? " (사용 중)" : ""}
        </span>
        {!source.active && <button
          type="button"
          disabled={!!state.pending}
          onClick={() => {
            void activateSource(source.connectionId);
          }}
        >사용</button>}
        <button
          type="button"
          disabled={!!state.pending}
          onClick={() => {
            void disconnectSource(source.connectionId);
          }}
        >연결 해제</button>
      </div>)}
    </div>}
    {!preparationOnly && <>
      <OcrControl disabled={!!state.pending} />
      {state.view?.status === "connected" && <SearchIndexSettings key={sources.find(source => source.active)?.connectionId ?? "active"} readStatus={readSourceIndexStatus} refresh={refreshSourceIndex} clear={clearSourceIndex} watch={indexWatch} />}
      <SemanticModelPanel key={`semantic:${sources.find(source => source.active)?.connectionId ?? "none"}`} tools={{ model: semanticModel, prepare: prepareSourceSemantic, readStatus: readSourceSemanticStatus }} scope={{ kind: "all" }} connected={state.view?.status === "connected"} scopeName={state.view?.folderName ?? "연결한 자료 폴더"} />
    </>}
    {(!preparationOnly || state.view?.status === "connected") && <RecoveryVaultSettings titleRef={vaultTitle} />}
    {preparationOnly && recoveryView.status !== "connected" && <p className={styles.scope}>보관함 연결은 나중에 할 수 있어요. 파일 변경 계획을 검사하고 실행하기 전에 연결이 필요합니다. 일반 대화는 바로 시작할 수 있어요.</p>}
    {state.view?.status === "connected" && (!preparationOnly || onConnected) && <div className={styles.finish}>
      <button
        type="button"
        className={actionClasses(recoveryView.status === "connected" ? "primary" : "secondary")}
        disabled={!!state.pending || !!recoveryState.pending}
        onClick={finish}
      >
        {recoveryView.status === "connected" ? "연결 마치기" : "보관함은 나중에 연결"}
      </button>
    </div>}
  </div>;
}

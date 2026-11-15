"use client";

/**
 * React와 폴더 기능을 연결한다. Provider가 소유자를 전달하면 repository → session → controller를 조립한다.
 * effect에서 브라우저 지원/연결 복원을 시작하고, 구독으로 UI를 갱신하며 Provider 종료 때 이전 요청을 무효화한다.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createBrowserStringStore } from "../../shared/browser-string-store";
import type { SourceFileExpectation } from "../../shared/grounded-evidence";
import type { ConnectionOwner, FolderHandle } from "./types";
import { FolderConnectionSession } from "./connection-session";
import { IndexedDbHandleRepository } from "./connection/handle-repository";
import { SourceConnectionController } from "./connection/source-connection-controller";
import { RecoveryConnectionController } from "./recovery/recovery-connection-controller";
import { subscribeAuthScopeRevoked } from "../../shared/auth-session-events";
import { AiRecordsController } from "../ai-records/ai-records-controller";
import { AiRecordRepository } from "../ai-records/storage/ai-record-repository";

type PickerWindow = Window & {
  showDirectoryPicker?: (options: {
    mode: "read" | "readwrite";
  }) => Promise<FolderHandle>;
};

/** React와 외부 상태의 연결점. Provider 수명 동안 controller를 유지하고 effect에서 브라우저 I/O를 시작한다. */

export function useSourceFolderConnection(owner: ConnectionOwner) {
  // Development handles remain in their original database; do not import them into an account.
  const [session] = useState(
    () =>
      new FolderConnectionSession(
        new IndexedDbHandleRepository("moa-source-connections-v1"),
      ),
  );
  const [picker] = useState(() => (options: { mode: "read" | "readwrite" }) => {
    const picker = (window as PickerWindow).showDirectoryPicker;

    if (!picker)
      return Promise.reject(new Error("directory-picker-unavailable"));

    return picker.call(window, options);
  });
  const [controller] = useState(
    () => new SourceConnectionController(session, picker),
  );
  const [recovery] = useState(
    () => new RecoveryConnectionController(session, picker),
  );
  const [records] = useState(() => new AiRecordsController(
    session,
    picker,
    new AiRecordRepository(session.aiRecordAccess),
  ));
  const recoveryState = useSyncExternalStore(
    recovery.subscribe,
    recovery.getSnapshot,
    recovery.getServerSnapshot,
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const connectionId = state.sources.find(source => source.active)?.connectionId ?? "";
  useEffect(() => { session.semanticModel.connect(); return session.semanticModel.dispose; }, [session]);
  const indexWatchStore = useMemo(() => createBrowserStringStore(
    `moa-index-watch:${JSON.stringify([owner.userId, owner.workspaceId, connectionId])}`,
    () => window.localStorage,
  ), [owner.userId, owner.workspaceId, connectionId]);
  const indexWatchEnabled = useSyncExternalStore(indexWatchStore.subscribe, () => indexWatchStore.read() === "true", () => false);
  const [indexWatchNotice, setIndexWatchNotice] = useState("");

  useEffect(() => {
    if (!indexWatchEnabled || !connectionId || state.view?.status !== "connected") return;

    let running: AbortController | null = null;
    let stopped = false;
    let nextCheckAt = 0;
    const check = async () => {
      if (document.visibilityState !== "visible") { running?.abort(); return; }
      if (running || stopped || indexWatchStore.read() !== "true" || Date.now() < nextCheckAt) return;

      const abort = new AbortController();
      running = abort;
      nextCheckAt = Date.now() + 30_000;

      try {
        const result = await session.pollSourceIndex(abort.signal);
        if (!stopped && !abort.signal.aborted && result) {
          setIndexWatchNotice(result.resumable ? "목록을 나눠 확인하고 있어요. 다음 확인 때 이어갑니다." : result.complete ? "현재 파일 목록을 자동으로 확인했어요." : "읽기·목록·저장 상한으로 자동 확인을 중지했어요. 수동으로 범위를 확인해 주세요.");
          if (!result.complete && !result.resumable) indexWatchStore.write("false");
        }
      } catch {
        if (!stopped && !abort.signal.aborted) {
          setIndexWatchNotice("자동 목록 확인을 중지했어요. 폴더 권한과 저장 상태를 확인해 주세요.");
          indexWatchStore.write("false");
        }
      } finally { if (running === abort) running = null; }
    };
    const onChange = () => { void check(); };

    onChange();
    const timer = window.setInterval(onChange, 30_000);
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onChange);

    return () => {
      stopped = true;
      running?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [session, indexWatchStore, indexWatchEnabled, connectionId, state.view?.status]);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void recovery.checkPresence();
    };

    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);

    const timer = window.setInterval(check, 5000);

    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [recovery]);

  useEffect(() => {
    if (
      !window.isSecureContext ||
      typeof (window as PickerWindow).showDirectoryPicker !== "function"
      ||
      !window.indexedDB
      ||
      !navigator.locks
    ) {
      controller.unavailable(
        "폴더 선택·기기 저장소를 지원하는 데스크톱 Chrome 또는 Edge에서 보안 연결로 열어 주세요.",
      );
    } else {
      void controller.load(owner).then(() => records.load());
    }

    const revoke = () => {
      records.stop();
      recovery.stop();
      controller.stop();
      void session.switchOwner(null);
    };
    const unsubscribeRevoked = subscribeAuthScopeRevoked(revoke);

    return () => {
      unsubscribeRevoked();
      revoke();
    };
  }, [controller, recovery, records, session, owner]);

  const readSourceFile = useCallback(
    (path: readonly string[], signal: AbortSignal, expectation: SourceFileExpectation) => session.readSourceFile(path, signal, expectation),
    [session]
  );

  return {
    owner,
    readSourceFile,
    records,
    recheckSourceSnapshot: session.recheckSourceSnapshot,
    state,
    recovery,
    recoveryState,
    recoveryView: session.view("recovery"),
    listing: controller.listing,
    preview: controller.preview,
    plan: controller.plan,
    navigation: controller.navigation,
    recoveryKey: session.recoveryVersion(),
    readRecoveryArchive: session.readRecoveryArchiveList,
    inspectRecoveryArchive: session.inspectRecoveryArchiveDetail,
    readRestoreDestination: session.readRestoreDestination,
    prepareRecoveryRestore: session.prepareRecoveryRestore,
    executeRecoveryRestore: session.executeRecoveryRestore,
    discardRecoveryRestore: session.discardRecoveryRestore,
    openManagedEditor: session.openManagedEditor,
    prepareManaged: session.prepareManaged,
    executeManaged: session.executeManaged,
    discardManaged: session.discardManaged,
    readManagedArchives: session.readManagedArchives,
    readManagedDestination: session.readManagedDestination,
    persistWorkflow: session.persistWorkflow,
    readWorkflow: session.readWorkflow,
    removeWorkflow: session.removeWorkflow,
    openInlineEditor: session.openInlineEditor,
    saveInlineEditor: session.saveInlineEditor,
    closeInlineEditor: session.closeInlineEditor,
    createEntry: session.createSourceEntry,
    readHistory: session.readSourceHistory,
    inspectHistoryTarget: session.inspectSourceHistoryTarget,
    inspectCopyHistory: session.inspectSourceCopyHistory,
    inspectRestoreHistory: session.inspectSourceRestoreHistory,
    trail: controller.trail,
    search: controller.search,
    organization: controller.organization,
    organizationExecution: controller.organizationExecution,
    finding: controller.finding,
    semanticModel: session.semanticModel,
    prepareSourceSemantic: session.prepareSourceSemantic,
    readSourceSemanticStatus: session.readSourceSemanticStatus,
    readSourceIndexStatus: session.readSourceIndexStatus,
    refreshSourceIndex: session.refreshSourceIndex,
    clearSourceIndex: async () => { indexWatchStore.write("false"); await session.clearSourceIndex(); },
    indexWatch: {
      enabled: indexWatchEnabled,
      notice: indexWatchNotice,
      setEnabled: (enabled: boolean) => { setIndexWatchNotice(""); indexWatchStore.write(String(enabled)); },
    },
    inspectBackup: session.inspectSourceBackup,
    executeBackup: session.executeSourceBackup,
    connect: controller.connect,
    reconnect: controller.reconnect,
    disconnect: controller.disconnect,
    sources: state.sources,
    activateSource: controller.activateSource,
    disconnectSource: controller.disconnectSource,
    reload: () => controller.load(owner),
  };
}

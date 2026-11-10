"use client";

/**
 * React와 폴더 기능을 연결한다. Provider가 소유자를 전달하면 repository → session → controller를 조립한다.
 * effect에서 브라우저 지원/연결 복원을 시작하고, 구독으로 UI를 갱신하며 Provider 종료 때 이전 요청을 무효화한다.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { SourceFileExpectation } from "../../../shared/grounded-evidence";
import type { ConnectionOwner, FolderHandle } from "../types";
import { FolderConnectionSession } from "../services/connection-session";
import { IndexedDbHandleRepository } from "../services/handle-repository";
import { SourceConnectionController } from "../store/source-connection-controller";
import { RecoveryConnectionController } from "../store/recovery-connection-controller";
import { subscribeAuthScopeRevoked } from "../../../shared/auth-session-events";
import { AiRecordsController } from "../../ai-records/store/ai-records-controller";
import { AiRecordRepository } from "../../ai-records/services/ai-record-repository";

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
      typeof (window as PickerWindow).showDirectoryPicker !== "function" ||
      !window.indexedDB ||
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

  const readSourceFile = useCallback((path: readonly string[], signal: AbortSignal, expectation: SourceFileExpectation) => session.readSourceFile(path, signal, expectation), [session]);

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

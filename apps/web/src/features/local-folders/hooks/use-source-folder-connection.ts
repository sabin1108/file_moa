"use client";

/**
 * React와 폴더 기능을 연결한다. Provider가 소유자를 전달하면 repository → session → controller를 조립한다.
 * effect에서 브라우저 지원/연결 복원을 시작하고, 구독으로 UI를 갱신하며 Provider 종료 때 이전 요청을 무효화한다.
 */


import { useEffect, useState, useSyncExternalStore } from "react";
import type { ConnectionOwner, FolderHandle } from "../types";
import { FolderConnectionSession } from "../services/connection-session";
import { IndexedDbHandleRepository } from "../services/handle-repository";
import { SourceConnectionController } from "../store/source-connection-controller";
import { RecoveryConnectionController } from "../store/recovery-connection-controller";

type PickerWindow = Window & { showDirectoryPicker?: (options: { mode: "read" | "readwrite" }) => Promise<FolderHandle> };

/** React와 외부 상태의 연결점. Provider 수명 동안 controller를 유지하고 effect에서 브라우저 I/O를 시작한다. */
export function useSourceFolderConnection(owner: ConnectionOwner) {
  // TEMPORARY(local-folder-dev): 개발 DB를 제품 계정 저장소와 섞지 않는다.
  // 배포 전 인증된 소유자와 제품 DB로 교체한다. 개발 핸들은 자동 이관하지 않는다.
  const [session] = useState(() => new FolderConnectionSession(new IndexedDbHandleRepository("moa-settings-development-v1")));
  const [picker] = useState(() => (options: { mode: "read" | "readwrite" }) => {
      const picker = (window as PickerWindow).showDirectoryPicker;
      if (!picker) return Promise.reject(new Error("directory-picker-unavailable"));
      return picker.call(window, options);
  });
  const [controller] = useState(() => new SourceConnectionController(session, picker));
  const [recovery] = useState(() => new RecoveryConnectionController(session, picker));
  const recoveryState = useSyncExternalStore(recovery.subscribe, recovery.getSnapshot, recovery.getServerSnapshot);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);

  useEffect(() => {
    const check = () => { if (document.visibilityState === "visible") void recovery.checkPresence(); };
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
    // TEMPORARY(local-folder-dev): 고정 개발 소유자가 원격 서비스에서 사용되지 않게 한다.
    // 이 제한만 삭제하면 안 된다. 실제 세션 연결을 검증한 뒤 함께 교체한다.
    if (!["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
      controller.unavailable("현재는 localhost의 개발 검증용 연결입니다. 실제 로그인 연동 후 서비스에서 사용할 수 있습니다.");
    } else if (!window.isSecureContext || typeof (window as PickerWindow).showDirectoryPicker !== "function" || !window.indexedDB || !navigator.locks) {
      controller.unavailable("폴더 선택·기기 저장소를 지원하는 데스크톱 Chrome 또는 Edge에서 localhost 주소로 열어 주세요.");
    } else {
      void controller.load(owner);
    }
    return () => {
      recovery.stop();
      controller.stop();
    };
  }, [controller, recovery, owner]);

  return { state, recovery, recoveryState, recoveryView: session.view("recovery"), listing: controller.listing, preview: controller.preview, plan: controller.plan, navigation: controller.navigation,
    recoveryKey: session.recoveryVersion(), readRecoveryArchive: session.readRecoveryArchiveList, inspectRecoveryArchive: session.inspectRecoveryArchiveDetail,
    readRestoreDestination: session.readRestoreDestination, prepareRecoveryRestore: session.prepareRecoveryRestore,
    executeRecoveryRestore: session.executeRecoveryRestore, discardRecoveryRestore: session.discardRecoveryRestore,
    openManagedEditor: session.openManagedEditor, prepareManaged: session.prepareManaged, executeManaged: session.executeManaged,
    discardManaged: session.discardManaged, readManagedArchives: session.readManagedArchives,
    readManagedDestination: session.readManagedDestination,
    persistWorkflow: session.persistWorkflow, readWorkflow: session.readWorkflow, removeWorkflow: session.removeWorkflow,
    openInlineEditor: session.openInlineEditor, saveInlineEditor: session.saveInlineEditor, closeInlineEditor: session.closeInlineEditor,
    createEntry: session.createSourceEntry, readHistory: session.readSourceHistory, inspectHistoryTarget: session.inspectSourceHistoryTarget,
    inspectCopyHistory: session.inspectSourceCopyHistory, inspectRestoreHistory: session.inspectSourceRestoreHistory, trail: controller.trail, search: controller.search,
    inspectBackup: session.inspectSourceBackup, executeBackup: session.executeSourceBackup,
    connect: controller.connect, reconnect: controller.reconnect, disconnect: controller.disconnect, reload: () => controller.load(owner) };
}

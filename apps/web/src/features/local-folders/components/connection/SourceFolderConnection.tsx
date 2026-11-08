"use client";

/**
 * SourceFolderSettings와 시안 검토 화면이 함께 사용하는 연결 상태 표시다.
 * FolderConnectionView와 조작 콜백만 받아 브라우저 핸들/소유자 정보를 노출하지 않고, 현재 상태에 맞는 연결 동작을 구성한다.
 */


import type { FolderConnectionView } from "../../types";
import { SettingRow } from "../../../../components/ui/SettingRow";
import { StatusLabel } from "../../../../components/ui/StatusLabel";
import { actionClasses } from "../../../../components/ui/action-classes";
import styles from "./source-folder-connection.module.css";

type Props = {
  view: FolderConnectionView;
  disabled?: boolean;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  compact?: boolean;
};

const statusLabels = {
  disconnected: "미연결",
  "needs-permission": "다시 연결 필요",
  connected: "연결됨",
} as const;

export function SourceFolderConnection({ view, disabled = false, onConnect, onReconnect, onDisconnect, compact = false }: Props) {
  if (compact) return (
    <section className={styles.compactConnection} aria-label="자료 폴더 연결">
      {view.status !== "disconnected" && <span>{view.folderName}</span>}
      <button
        type="button"
        className={actionClasses(view.status === "connected" ? "ghost" : "primary")}
        disabled={disabled}
        onClick={view.status === "needs-permission" ? onReconnect : onConnect}
      >
        {view.status === "disconnected"
          ? "폴더 연결"
          : view.status === "needs-permission"
            ? "다시 연결"
            : "다른 폴더 선택"}
      </button>
    </section>
  );
  return <section className={styles.connection} aria-label="자료 폴더 연결">
    <SettingRow
      title={view.folderName ?? "연결한 폴더 없음"}
      description="자료는 읽기 전용으로 사용합니다. 연결을 해제해도 원본은 유지됩니다."
    >
      <div className={styles.controls}>
        <StatusLabel>{statusLabels[view.status]}</StatusLabel>
        <div className={styles.actions}>
          {view.status === "disconnected" && <button type="button" disabled={disabled} className={actionClasses("primary")} onClick={onConnect}>폴더 연결</button>}
          {view.status === "needs-permission" && <button type="button" disabled={disabled} className={actionClasses("primary")} onClick={onReconnect}>다시 연결</button>}
          {view.status !== "disconnected" && <button type="button" disabled={disabled} className={actionClasses("secondary")} onClick={onConnect}>다른 폴더 선택</button>}
          {view.status !== "disconnected" && <button type="button" disabled={disabled} className={actionClasses("secondary")} onClick={onDisconnect}>연결 해제</button>}
        </div>
      </div>
    </SettingRow>
  </section>;
}

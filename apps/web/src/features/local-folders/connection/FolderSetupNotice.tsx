"use client";

import { useState } from "react";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import { SourceFolderSettingsDialog } from "./SourceFolderSettingsDialog";
import styles from "./source-folder-connection.module.css";

/** 튜토리얼을 건너뛰어도 실제 연결 상태를 안내하며 현재 대화와 제안은 유지한다. */
export function FolderSetupNotice() {
  const { state, recoveryView } = useSharedSourceFolderConnection();
  const sourceConnected = state.view?.status === "connected";
  const recoveryConnected = recoveryView.status === "connected";
  const [configuring, setConfiguring] = useState(false);
  const prepared = sourceConnected && recoveryConnected;

  if (!configuring && (state.phase === "loading" || prepared)) return null;

  return <section className={styles.preparation} aria-label="파일 작업 준비">
    <div>
      <h3>{prepared ? "파일 작업 준비를 마쳤어요" : "파일 정리 전, 두 곳을 연결해 주세요"}</h3>
      <p>자료 폴더 · {sourceConnected ? "연결됨" : "연결 필요"} / 복구 보관함 · {recoveryConnected ? "연결됨" : "연결 필요"}</p>
      <p>자료 폴더는 읽을 위치, 복구 보관함은 변경 전 사본을 보관할 위치예요. 일반 대화는 바로 할 수 있어요.</p>
    </div>
    <SourceFolderSettingsDialog label="사용 준비하기" preparationOnly onOpenChange={setConfiguring} />
  </section>;
}

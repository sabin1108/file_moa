"use client";

import { useState } from "react";
import type { FolderConnectionView } from "../../../features/local-folders/types";
import { SourceFolderConnection } from "../../../features/local-folders/components/connection/SourceFolderConnection";
import { ScenarioControls } from "./feedback/ScenarioControls";
import styles from "./feedback/feedback-scenes.module.css";

const examples = {
  disconnected: { status: "disconnected", folderName: null },
  permission: { status: "needs-permission", folderName: "학습 노트" },
  connected: { status: "connected", folderName: "학습 노트" },
  long: { status: "connected", folderName: "2026년_프로젝트별_학습기록과참고자료를모아둔아주긴폴더이름_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" },
} as const satisfies Record<string, FolderConnectionView>;

const options = [
  { value: "disconnected", label: "미연결" },
  { value: "permission", label: "다시 연결 필요" },
  { value: "connected", label: "연결됨" },
  { value: "long", label: "긴 이름" },
] as const;

export function FolderConnectionDemo() {
  const [example, setExample] = useState<keyof typeof examples>("disconnected");
  const [lastCall, setLastCall] = useState({ action: "", count: 0 });
  const record = (action: string) => setLastCall(previous => ({ action, count: previous.count + 1 }));

  return <div className={styles.stack}>
    <p>합성 데이터 검토용입니다. 버튼을 누르면 아래에 호출 기록만 표시됩니다.</p>
    <SourceFolderConnection
      view={examples[example]}
      onConnect={() => record("폴더 연결")}
      onReconnect={() => record("다시 연결")}
      onDisconnect={() => record("연결 해제")}
    />
    <p role="status" aria-live="polite">
      {lastCall.count === 0 ? "호출 기록 없음 · 위 버튼을 눌러 확인하세요." : `마지막 호출: ${lastCall.action} · 누른 횟수: ${lastCall.count}회`}
    </p>
    <ScenarioControls value={example} options={options} onChange={next => {
      setExample(next);
      setLastCall({ action: "", count: 0 });
    }} />
  </div>;
}

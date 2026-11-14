"use client";

import { useState, useSyncExternalStore } from "react";
import {
  editorIntervals,
  getAutosaveSeconds,
  serverAutosaveSeconds,
  setAutosaveSeconds,
  subscribeEditorPreferences
} from "./editor-preferences";
import styles from "../../connection/source-folder-connection.module.css";

export function EditorSettings() {
  const seconds = useSyncExternalStore(subscribeEditorPreferences, getAutosaveSeconds, serverAutosaveSeconds);
  const [error, setError] = useState(false);

  return <section className={styles.vault} aria-label="문서 편집 설정">
    <h3>문서 편집</h3>
    <label>자동저장 간격 <select
      value={seconds}
      onChange={event => {
        setError(!setAutosaveSeconds(Number(event.target.value)));
      }}
    >
      {editorIntervals.map(value => <option key={value} value={value}>
        {value === 0 ? "자동저장 끄기" : `${value}초마다`}
      </option>)}
    </select></label>
    <p>직접 저장은 항상 사용할 수 있습니다. 처음 저장할 때 원본을 한 번 보존한 뒤 주기적으로 저장합니다.</p>
    {error && <p role="alert">이 탭에는 적용했지만 저장하지 못했어요. 새로 열면 이전 설정으로 돌아갈 수 있습니다.</p>}
  </section>;
}

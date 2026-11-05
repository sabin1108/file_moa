"use client";
import { useState, useSyncExternalStore } from "react";
import { editorIntervals, getAutosaveSeconds, serverAutosaveSeconds, setAutosaveSeconds, subscribeEditorPreferences } from "../../store/editor-preferences";
import styles from "./source-folder-connection.module.css";

export function EditorSettings() {
  const seconds = useSyncExternalStore(subscribeEditorPreferences, getAutosaveSeconds, serverAutosaveSeconds);
  const [error, setError] = useState(false);
  return <section className={styles.vault} aria-label="문서 편집 설정">
    <h3>문서 편집</h3>
    <label>자동저장 간격 <select value={seconds} onChange={event => {
      try { setAutosaveSeconds(Number(event.target.value)); setError(false); }
      catch { setError(true); }
    }}>{editorIntervals.map(value => <option key={value} value={value}>{value === 0 ? "자동저장 끄기" : `${value}초마다`}</option>)}</select></label>
    <p>직접 저장은 항상 사용할 수 있습니다. 처음 저장할 때 원본을 한 번 보존한 뒤 주기적으로 저장합니다.</p>
    {error && <p role="alert">설정을 저장하지 못했습니다. 브라우저 저장소를 확인해 주세요.</p>}
  </section>;
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import { EntryCreationController } from "./entry-creation-controller";
import { resolveNewEntry, type EntryKind } from "./new-entry";
import { actionClasses } from "../../../components/ui/action-classes";
import styles from "./new-folder-form.module.css";

/** 목록/목적지 탐색이 공유하는 명시적 생성 폼. 실제 쓰기와 수명은 controller/service 소유다. */

export function NewEntryForm({ path, folderName, disabled, onCreated }: {
  path: readonly string[];
  folderName: string;
  disabled?: boolean;
  onCreated: () => void;
}) {
  const connection = useSharedSourceFolderConnection();
  const [controller] = useState(() => new EntryCreationController(connection.createEntry));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<EntryKind>("folder");

  useEffect(() => () => controller.dispose(), [controller]);

  const pending = state.phase === "pending";
  let entry: ReturnType<typeof resolveNewEntry> | null = null;

  try {
    entry = resolveNewEntry(name, kind);
  } catch { /* 입력 중에는 검증 결과를 강요하지 않는다. 제출 시 오류를 표시한다. */ }

  return <details className={styles.creation}>
    <summary>＋ 새로 만들기</summary>
    <form
      aria-label="새로 만들기"
      onSubmit={event => {
        event.preventDefault();

        if (disabled || pending) return;

        void controller.run(path, name, kind).then(success => {
          if (success) {
            setName("");
            onCreated();
          }
        });
      }}
    >
      <p>생성 위치: <strong>
        {[folderName, ...path].join(" / ")}
      </strong></p>
      <label>항목 종류<select
        value={kind}
        disabled={disabled || pending}
        onChange={event => {
          const value = event.target.value;

          if (value === "folder" || value === "txt" || value === "md") setKind(value);
        }}
      >
        <option value="folder">폴더</option>
        <option value="txt">텍스트 문서 (.txt)</option>
        <option value="md">마크다운 문서 (.md)</option>
      </select></label>
      <label>이름<input
        value={name}
        maxLength={255}
        autoComplete="off"
        required
        disabled={disabled || pending}
        onKeyDown={event => {
          if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
        }}
        onChange={event => setName(event.target.value)}
        placeholder={kind === "folder" ? "새 폴더 이름" : "새 문서 이름"}
      /></label>
      {entry && <p className={styles.note}>생성할 {entry.kind === "folder" ? "폴더" : "빈 파일"}: <strong>
        {entry.name}
      </strong></p>}
      {entry && entry.kind !== kind && <p className={styles.note}>입력한 .{entry.kind} 확장자에 맞춰 빈 파일을 만듭니다.</p>}
      {!entry && kind !== "folder" && <p className={styles.note}>.{kind} 확장자는 자동으로 붙습니다. 내용을 쓰지 않은 빈 파일을 만듭니다.</p>}
      <p className={styles.note}>작업 기록은 현재 위치의 .moa-history에 자동 보관합니다.</p>
      <button type="submit" className={actionClasses("primary")} disabled={disabled || pending || !name}>
        {pending ? "처리 중…" : "만들기"}
      </button>
      {state.message && <p role={state.phase === "error" ? "alert" : "status"}>
        {state.message}
      </p>}
    </form>
  </details>;
}

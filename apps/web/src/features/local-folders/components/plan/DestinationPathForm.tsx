"use client";

import { useId, useState } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { parsePastedFolderPath } from "../../lib/pasted-folder-path";
import styles from "./destination-folder-picker.module.css";
/** 직접 입력도 폴더 탐색 안에서 검증한다. 경로를 연 다음 명시적 폴더 선택을 거쳐 확정한다. */

export function DestinationPathForm({ path, rootName, disabled, onOpen, purpose = "목적지" }: {
  path: readonly string[];
  rootName: string;
  disabled: boolean;
  onOpen: (path: readonly string[]) => Promise<void>;
  purpose?: string;
}) {
  const [value, setValue] = useState([rootName, ...path].join("/"));
  const [invalid, setInvalid] = useState(false);
  const [candidate, setCandidate] = useState<readonly string[] | null>(null);
  const currentPath = [rootName, ...path].join("/");
  const [previousPath, setPreviousPath] = useState(currentPath);

  if (previousPath !== currentPath) {
    setPreviousPath(currentPath);
    setValue(currentPath);
    setInvalid(false);
    setCandidate(null);
  }

  const hint = useId();

  return <form
    className={styles.pathForm}
    aria-label={`${purpose} 경로 직접 입력`}
    onSubmit={event => {
      event.preventDefault();

      try {
        const next = parsePastedFolderPath(value, rootName);

        setInvalid(false);

        if (next.requiresConfirmation) {
          setCandidate(next.path);
        } else {
          setCandidate(null);
          setValue([rootName, ...next.path].join("/"));
          void onOpen(next.path);
        }
      } catch {
        setInvalid(true);
        setCandidate(null);
      }
    }}
  >
    <label>경로 직접 입력
      <input
        value={value}
        onChange={event => {
          setValue(event.target.value);
          setInvalid(false);
          setCandidate(null);
        }}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={hint}
        autoComplete="off"
        spellCheck={false}
        placeholder="예: 자료/보관"
        onKeyDown={event => {
          if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
            event.preventDefault();
          }
        }}
      />
    </label>
    <button
      type="submit"
      className={actionClasses("secondary")}
      disabled={disabled}
    >경로 열기</button>
    <p
      id={hint}
      className={styles.note}
      role={invalid ? "alert" : undefined}
    >
      {invalid
        ? "연결 폴더 이름을 한 번 포함한 Windows 경로나 폴더 안의 상대 경로를 입력해 주세요. .. 및 네트워크 경로는 지원하지 않습니다."
        : "Windows 경로 붙여넣기 또는 /·\\로 구분한 상대 경로를 입력하세요. 비우면 연결 폴더를 엽니다."}
    </p>
    {candidate && <div className={styles.pathConfirmation}>
      <p>연결한 폴더에서 열 위치: <strong>
        {[rootName, ...candidate].join(" / ")}
      </strong></p>
      <p className={styles.note}>브라우저는 드라이브 경로를 확인할 수 없습니다. 연결한 폴더 안에서 위 위치를 엽니다.</p>
      <button
        type="button"
        className={actionClasses("secondary")}
        disabled={disabled}
        onClick={() => {
          setValue([rootName, ...candidate].join("/"));
          void onOpen(candidate);
          setCandidate(null);
        }}
      >연결 폴더 기준으로 열기</button>
    </div>}
  </form>;
}

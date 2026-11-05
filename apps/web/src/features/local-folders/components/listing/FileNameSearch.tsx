"use client";

import { useEffect, useId, useRef, useState } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import styles from "./file-name-search.module.css";

type Props = {
  query: string;
  disabled: boolean;
  onQueryChange: (query: string) => void;
  onClose: () => void;
};

/** 확정된 검색어는 listing store, IME 조합 중 임시 문자열과 입력 초점만 이 컴포넌트가 소유한다. */
export function FileNameSearch({ query, disabled, onQueryChange, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const hint = useId();
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  const clear = () => {
    composing.current = false;
    setDraft(null);
    onQueryChange("");
    input.current?.focus();
  };

  return <div className={styles.search} role="search" aria-label="하위 폴더 포함 이름 검색">
    <label className={styles.field}>
      <span className="sr-only">현재 폴더와 하위 폴더에서 이름 검색</span>
      <input ref={input} type="text" inputMode="search" value={draft ?? query} disabled={disabled}
        aria-describedby={hint} placeholder="파일 또는 폴더 이름" autoComplete="off" spellCheck={false}
        onCompositionStart={event => { composing.current = true; setDraft(event.currentTarget.value); }}
        onCompositionEnd={event => {
          composing.current = false;
          setDraft(null);
          onQueryChange(event.currentTarget.value);
        }}
        onChange={event => {
          if (composing.current) setDraft(event.currentTarget.value);
          else onQueryChange(event.currentTarget.value);
        }}
        onKeyDown={event => {
          if (event.key === "Escape" && !composing.current && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (query) clear(); else onClose();
          }
        }} />
    </label>
    <button type="button" className={actionClasses("secondary")} disabled={disabled || !(draft ?? query)} onClick={clear}>검색 지우기</button>
    <p id={hint} className={styles.hint}>현재 폴더와 모든 하위 폴더의 이름 검색 · 본문 제외</p>
  </div>;
}

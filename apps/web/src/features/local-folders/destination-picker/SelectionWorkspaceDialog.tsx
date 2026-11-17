"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import styles from "./selection-workspace-dialog.module.css";

/** 좁은 대화 면 밖에서 기존 폴더 탐색과 자료 선택을 같은 크기로 제공한다. */
export function SelectionWorkspaceDialog({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus();
    return () => {
      element?.close();
      const target = previous instanceof HTMLElement && previous.isConnected ? previous : document.getElementById("message-draft");
      target?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={id} data-selection-workspace onCancel={event => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }}>
    <header className={styles.header}><h2 id={id} ref={heading} tabIndex={-1}>{title}</h2>
      <button type="button" className={actionClasses("secondary")} onClick={onClose}>선택창 닫기</button>
    </header>
    <div className={styles.body} tabIndex={0} aria-label={`${title} 목록`}>{children}</div>
    <p className={styles.hint}>아래로 스크롤해 목록 끝까지 확인할 수 있어요.</p>
  </dialog>;
}

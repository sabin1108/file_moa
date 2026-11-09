"use client";

import { useEffect, useRef } from "react";
import { actionClasses } from "../../../components/ui/action-classes";
import type { ConversationRequestIntent } from "../lib/request-routing";
import styles from "../../local-folders/components/organization/organization-preparation.module.css";

export function RequestIntentChoice({ onChoose, onCancel, disabled, onChat, onGrounded }: {
  onChoose: (intent: ConversationRequestIntent) => void;
  onCancel: () => void;
  disabled: boolean;
  onChat?: () => void;
  onGrounded?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return <section className={styles.preparation} aria-label="요청 작업 선택" data-request-intent-choice>
    <h2 ref={heading} tabIndex={-1}>어떤 작업을 할까요?</h2>
    <div className={styles.actions}>
      <button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={() => onChoose("find")}>자료 찾기</button>
      <button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={() => onChoose("organize")}>자료 정리</button>
      {onChat && <button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={onChat}>일반 대화</button>}
      {onGrounded && <button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={onGrounded}>선택 자료로 답변</button>}
      <button type="button" className={actionClasses("ghost")} onClick={onCancel}>계속 작성</button>
    </div>
  </section>;
}

import { useId, useState, type ReactNode, type Ref } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import styles from "./source-document-preview.module.css";

/** 읽기와 편집이 같은 제목·도구줄·정보·본문 자리를 사용한다. 파일 접근은 하지 않는다. */

export function DocumentWorkspace({ mode, phase, title, headingRef, back, actions, status, info, feedback, children, footer, blockQuickSwitch }: {
  mode: "preview" | "editor";
  phase: string;
  title: string;
  headingRef?: Ref<HTMLHeadingElement>;
  back: ReactNode;
  actions: ReactNode;
  status?: ReactNode;
  info: ReactNode;
  feedback?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  blockQuickSwitch?: boolean;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();

  return <section
    data-quick-switch-block={blockQuickSwitch || undefined}
    className={styles.preview}
    aria-label={mode === "editor" ? "문서 인라인 편집기" : "파일 미리보기"}
    data-preview-phase={mode === "preview" ? phase : undefined}
    data-editor-phase={mode === "editor" ? phase : undefined}
  >
    <div className={styles.toolbar}>
      {back}
      <div className={styles.actions}>
        {actions}
      </div>
    </div>
    <h2 ref={headingRef} tabIndex={-1} className={styles.title}>
      {title}
    </h2>
    <div className={styles.infoToggle}>
      <p className={styles.documentStatus} role="status">
        {status}
      </p>
      <button
        type="button"
        className={actionClasses("ghost")}
        aria-expanded={infoOpen}
        aria-controls={infoId}
        onClick={() => setInfoOpen(open => !open)}
      >파일 정보 {infoOpen ? "접기" : "보기"}</button>
    </div>
    <aside id={infoId} className={styles.info} hidden={!infoOpen} aria-label="파일 정보">
      {info}
    </aside>
    {feedback && <div className={styles.feedback}>
      {feedback}
    </div>}
    <div className={styles.documentContent}>
      {children}
    </div>
    <div className={styles.note}>
      {footer}
    </div>
  </section>;
}

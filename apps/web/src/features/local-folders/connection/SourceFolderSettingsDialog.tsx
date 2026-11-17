"use client";

/**
 * 파일 화면의 설정 아이콘에서 SourceFolderSettings를 팝업으로 여는 조합이다.
 * native dialog가 배경/키보드 범위를 담당하고 이 컴포넌트는 열림·내용·초점 수명을 관리한다. 닫기와 늦은 연결 완료는 별개다.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { actionClasses } from "../../../components/ui/action-classes";
import { useSharedSourceFolderConnection } from "../SourceFolderProvider";
import { SourceFolderSettings } from "./SourceFolderSettings";
import styles from "./source-folder-settings-dialog.module.css";

/** 연결 설정의 팝업 수명만 담당한다. focus trap과 배경 inert는 native dialog에 맡긴다. */

export function SourceFolderSettingsDialog({ compact = false, label = "폴더 연결 관리", preparationOnly = false, onOpenChange }: {
  compact?: boolean;
  label?: string;
  preparationOnly?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { state } = useSharedSourceFolderConnection();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const dialogId = useId();

  useEffect(() => {
    if (open) title.current?.focus();
  }, [open]);

  const show = () => {
    if (!dialog.current?.open) dialog.current?.showModal();

    setOpen(true);
    onOpenChange?.(true);
  };
  const close = () => {
    dialog.current?.close();
    setOpen(false);
    onOpenChange?.(false);
    requestAnimationFrame(() => {
      const target = trigger.current?.isConnected ? trigger.current : document.getElementById("message-draft") ?? document.querySelector<HTMLElement>("[data-conversation-title]");

      target?.focus({ preventScroll: true });
    });
  };
  const notice = state.phase === "disconnect-error"
    ? "연결 해제를 다시 시도해 주세요."
    : state.view?.status === "needs-permission"
      ? "다시 연결이 필요해요."
      : state.pending
        ? "연결 작업을 처리하고 있어요."
        : state.phase === "load-error" || state.phase === "unsupported"
          ? "연결 상태를 확인해 주세요."
          : state.notice && state.notice.state !== "success" ? state.notice.title : null;

  return <div className={compact ? styles.compact : styles.controls}>
    {notice && <p role="status" className={styles.status}>
      {notice}
    </p>}
    <button
      ref={trigger}
      type="button"
      className={actionClasses(compact ? "ghost" : "secondary")}
      aria-haspopup="dialog"
      aria-label={label}
      data-tour="folder-connection"
      title={label}
      aria-controls={dialogId}
      aria-expanded={open}
      onClick={show}
    >
      <Icon name="settings" />
      {!compact && label}
    </button>
    <dialog
      ref={dialog}
      id={dialogId}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        // close 이벤트는 뒤늦게 전달된다. 그 사이 다시 연 팝업의 내용을 지우지 않는다.
        if (!dialog.current?.open) {
          setOpen(false);
          onOpenChange?.(false);
        }
      }}
    >
      {open && <>
        <header className={styles.header}>
          <h2 id={titleId} ref={title} tabIndex={-1}>폴더 연결 관리</h2>
          <button
            type="button"
            className={actionClasses("secondary")}
            onClick={close}
            aria-label="폴더 연결 관리 닫기"
          >
            <Icon name="close" />
            <span>닫기</span>
          </button>
        </header>
        <SourceFolderSettings onConnected={close} preparationOnly={preparationOnly} />
      </>}
    </dialog>
  </div>;
}

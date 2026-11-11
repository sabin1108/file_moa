"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "../../../../components/ui/Icon";
import styles from "../listing/folder-workspace.module.css";

/** 같은 본문을 데스크톱 열과 모바일 native modal에 배치한다. 목록을 다시 mount하지 않는다. */

export function FilePreviewPane({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;

    if (!element) return;

    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      if (element.open) element.close();

      if (open) {
        if (media.matches) element.showModal(); else element.show();
      }
    };

    sync();
    media.addEventListener("change", sync);

    return () => {
      media.removeEventListener("change", sync);

      if (element.open) element.close();
    };
  }, [open]);

  return <aside className={styles.previewPane} aria-label="미리보기 영역">
    {!open && <div className={styles.previewEmpty}>
      <Icon name="file" size={40} />
      <h2>파일 미리보기</h2>
      <p>목록에서 MD 또는 TXT 파일을 열어 보세요.</p>
    </div>}
    <dialog
      ref={dialog}
      className={styles.previewDialog}
      aria-label="문서 미리보기"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && children}
    </dialog>
  </aside>;
}

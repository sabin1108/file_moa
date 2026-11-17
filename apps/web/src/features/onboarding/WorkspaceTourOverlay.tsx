"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { actionClasses } from "../../components/ui/action-classes";
import { useTourCardPosition, useTourSpotlight } from "./useTourSpotlight";
import type { TourStep } from "./workspace-tour-steps";
import ui from "../../styles/workspace-ui.module.css";
import styles from "./workspace-tour.module.css";

export function WorkspaceTourOverlay({ dialog, current, step, total, ready, onClose, onMove, contextNote, children }: {
  dialog: RefObject<HTMLDialogElement | null>;
  current: TourStep;
  step: number;
  total: number;
  ready: boolean;
  onClose: () => void;
  onMove: (next: number) => void;
  contextNote?: string;
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const explanation = useRef<HTMLElement>(null);
  const composing = useRef(false);

  useLayoutEffect(() => {
    const node = dialog.current;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    node?.showModal();
    heading.current?.focus({ preventScroll: true });

    return () => {
      node?.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [dialog]);

  const { rect, settled } = useTourSpotlight(current.selector, true, ready);
  const position = useTourCardPosition(explanation, rect, true);

  useEffect(() => { composing.current = false; if (ready) heading.current?.focus({ preventScroll: true }); }, [ready, step]);

  const advance = () => {
    if (!ready) return;
    if (step === total - 1) onClose();
    else onMove(step + 1);
  };

  return <dialog ref={dialog} className={`${ui.system} ${styles.tour}`} aria-labelledby="workspace-tour-title" aria-busy={!ready || !settled} onCancel={event => { event.preventDefault(); onClose(); }}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onKeyDown={event => {
      if (event.key !== "Enter" || event.defaultPrevented || !ready || event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
        || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
      const target = event.target;
      if (target instanceof Element && (target.closest('input, textarea, select, button, a, [role="button"], [role="textbox"], [role="combobox"]')
        || target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault();
      advance();
    }}>
    {rect && position?.highlight !== false
      ? <div className={styles.spotlight} data-pending={!settled} aria-hidden="true" style={rect} />
      : <div className={styles.shade} aria-hidden="true" />}
    <section ref={explanation} className={styles.explanation} style={position ? { top: position.top, left: position.left, maxHeight: position.maxHeight } : undefined}>
      <div key={step} className={styles.copy} data-tour-copy>
        <p className={styles.progress}>모아 사용 방법 · {step + 1} / {total}</p>
        <h2 id="workspace-tour-title" ref={heading} tabIndex={-1}>{current.title}</h2>
        <p>{current.text}</p>
        {contextNote && <p>{contextNote}</p>}
        {ready && children}
        {!ready && <p role="status">화면을 불러오고 있어요.</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={actionClasses("ghost")} onClick={onClose}>건너뛰기</button>
        {step > 0 && <button type="button" className={actionClasses("secondary")} disabled={!ready} onClick={() => onMove(step - 1)}>이전</button>}
        <button type="button" className={actionClasses("primary")} disabled={!ready} aria-keyshortcuts="Enter" onClick={advance}>{step === total - 1 ? "완료" : "다음"}</button>
      </div>
    </section>
  </dialog>;
}

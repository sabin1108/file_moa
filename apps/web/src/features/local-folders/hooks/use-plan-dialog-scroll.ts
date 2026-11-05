"use client";

import { useEffect, type RefObject } from "react";

/** 팝업이 휠을 소유한다. 목적지 탐색에서는 포인터 위치와 무관하게 폴더 목록을 스크롤한다. */
export function usePlanDialogScroll(dialog: RefObject<HTMLDialogElement | null>, open: boolean, browsing: boolean) {
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement, body = document.body;
    const rootOverflow = root.style.overflow, bodyOverflow = body.style.overflow;
    root.style.overflow = "hidden"; body.style.overflow = "hidden";
    const wheel = (event: WheelEvent) => {
      const modal = dialog.current;
      if (!modal?.open || event.ctrlKey) return;
      // A foreground native dialog retains ownership if another modal is ever stacked above this one.
      if ([...document.querySelectorAll("dialog:modal")].at(-1) !== modal) return;
      const folders = browsing ? modal.querySelector<HTMLElement>('[aria-label="목적지 하위 폴더"]') : null;
      const bounds = folders?.getBoundingClientRect(), modalBounds = modal.getBoundingClientRect();
      const visibleList = bounds && bounds.top < modalBounds.bottom && bounds.bottom > modalBounds.top;
      const target = folders && visibleList && folders.scrollHeight > folders.clientHeight ? folders : modal;
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? target.clientHeight : 1;
      target.scrollTop += event.deltaY * scale;
    };
    window.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("wheel", wheel, true);
      root.style.overflow = rootOverflow; body.style.overflow = bodyOverflow;
    };
  }, [dialog, open, browsing]);
}

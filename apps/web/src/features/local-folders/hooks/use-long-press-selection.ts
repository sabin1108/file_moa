"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

export const LONG_PRESS_MS = 650;

/** 한 번의 포인터 누름만 추적한다. 전역 취소 리스너는 누르는 동안에만 존재한다. */
export function useLongPressSelection(disabled: boolean, select: () => void) {
  const release = useRef<(() => void) | null>(null);
  const releaseClickGuard = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    if (disabled) { release.current?.(); releaseClickGuard.current?.(); }
    return () => { release.current?.(); releaseClickGuard.current?.(); };
  }, [disabled]);
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (disabled || !event.isPrimary) return;
      release.current?.();
      releaseClickGuard.current?.();
      suppressClick.current = false;
      if (event.button !== 0 || (event.target as HTMLElement).closest("input,label")) return;
      const element = event.currentTarget;
      const { pointerId, clientX, clientY } = event;
      element.setAttribute("data-holding", "true");
      const cancel = () => {
        clearTimeout(timer);
        element.removeAttribute("data-holding");
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", pointerCancelled, true);
        window.removeEventListener("scroll", interrupted, true);
        window.removeEventListener("blur", interrupted);
        document.removeEventListener("visibilitychange", interrupted);
        release.current = null;
      };
      const interrupted = () => { suppressClick.current = true; cancel(); };
      const move = (e: globalThis.PointerEvent) => {
        if (e.pointerId === pointerId && Math.hypot(e.clientX - clientX, e.clientY - clientY) > 10) interrupted();
      };
      const up = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) cancel(); };
      const pointerCancelled = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) interrupted(); };
      const timer = setTimeout(() => {
        suppressClick.current = true;
        cancel();
        // 선택 도구가 생기며 행이 움직여도 touch의 후속 click이 다른 파일을 열지 않게 한다.
        let expiry: ReturnType<typeof setTimeout> | undefined;
        const clearGuard = () => {
          clearTimeout(expiry);
          window.removeEventListener("click", eatClick, true);
          window.removeEventListener("pointerdown", nextGesture, true);
          window.removeEventListener("pointerup", released, true);
          window.removeEventListener("pointercancel", released, true);
          window.removeEventListener("contextmenu", blockMenu, true);
          releaseClickGuard.current = null;
        };
        const eatClick = (e: globalThis.MouseEvent) => {
          if (e.detail === 0) return;
          e.preventDefault(); e.stopImmediatePropagation(); suppressClick.current = false; clearGuard();
        };
        const nextGesture = (e: globalThis.PointerEvent) => { if (e.isPrimary) clearGuard(); };
        const blockMenu = (e: Event) => e.preventDefault();
        const released = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) expiry = setTimeout(clearGuard, 800); };
        releaseClickGuard.current = clearGuard;
        window.addEventListener("click", eatClick, true);
        window.addEventListener("pointerdown", nextGesture, true);
        window.addEventListener("pointerup", released, true);
        window.addEventListener("pointercancel", released, true);
        window.addEventListener("contextmenu", blockMenu, true);
        select();
      }, LONG_PRESS_MS);
      release.current = cancel;
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", pointerCancelled, true);
      window.addEventListener("scroll", interrupted, true);
      window.addEventListener("blur", interrupted);
      document.addEventListener("visibilitychange", interrupted);
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (suppressClick.current && event.detail !== 0) {
        event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
      }
    },
    onContextMenu(event: MouseEvent<HTMLElement>) {
      if (release.current || suppressClick.current) event.preventDefault();
    },
  };
}

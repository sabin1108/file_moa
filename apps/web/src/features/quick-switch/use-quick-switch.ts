"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  canStartQuickHold,
  clampQuickPosition,
  matchesQuickShortcut,
  parseQuickPreferences,
  quickDirection,
  QUICK_HOLD_MS
} from "./quick-switch";
import { readQuickPreferences, serverQuickPreferences, subscribeQuickPreferences } from "./quick-preferences";
import { subscribeQuickSwitch } from "./quick-requests";

type Point = Readonly<{
  x: number;
  y: number
}>;

type Menu = Readonly<{
  position: Point;
  anchor: Point;
  active: number | null;
  trigger: "pointer" | "keyboard" | "click";
  pointerId?: number;
  code?: string;
  route: string;
  host: HTMLElement
}>;

const editable = "input,textarea,select,[contenteditable]:not([contenteditable=false])";
const scope = "[data-workspace-quick-menu]";
const blockedOverlay = () => [...document.querySelectorAll<HTMLElement>("[data-navigation-loading],[data-quick-switch-block]")].some(node => node.checkVisibility());
const activeScope = () => [...document.querySelectorAll<HTMLElement>(scope)].some(node => node.checkVisibility());
const activeHost = () => [...document.querySelectorAll<HTMLDialogElement>("dialog:modal")].at(-1) ?? document.body;

export function useQuickSwitch(route: string, onChoose: (index: number) => void) {
  const raw = useSyncExternalStore(subscribeQuickPreferences, readQuickPreferences, serverQuickPreferences);
  const preferences = parseQuickPreferences(raw);
  const [menu, setMenu] = useState<Menu | null>(null);
  const session = useRef<Menu | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const suppressClick = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const position = menu?.position;
  const trigger = menu?.trigger;

  useLayoutEffect(() => {
    if (!position) return;

    const element = root.current;

    if (element?.showPopover && !element.matches(":popover-open")) element.showPopover();

    if (trigger === "click") root.current?.querySelectorAll<HTMLButtonElement>("[data-quick-target]")[1]?.focus();
    else root.current?.focus({ preventScroll: true });

    return () => {
      if (element?.hidePopover && element.matches(":popover-open")) element.hidePopover();
    };
  }, [position, trigger]);

  const close = useCallback((restore = true) => {
    const element = root.current;

    session.current = null;
    setMenu(null);

    if (!restore) return;

    requestAnimationFrame(() => {
      const focusWasLost = document.activeElement === document.body || element?.contains(document.activeElement);

      if (focusWasLost && previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    });
  }, []);

  const choose = useCallback((index: number | null) => {
    if (!activeScope() || blockedOverlay() || session.current?.route !== route || session.current.host !== activeHost()) {
      close(false);

      return;
    }

    close(index === null);

    if (index !== null) onChoose(index);
  }, [route, close, onChoose]);

  const select = useCallback((index: number | null, focus = false) => {
    if (!session.current) return;

    session.current = { ...session.current, active: index };
    setMenu(session.current);

    if (focus && index !== null) root.current?.querySelectorAll<HTMLButtonElement>("[data-quick-target]")[index]?.focus();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: (Point & {
      id: number;
      host: HTMLElement
    }) | null = null;
    let lastPointer: Point | null = null;
    const clearPending = () => {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
    };
    const guardClick = () => {
      suppressClick.current = true;
      clearTimeout(clickTimer.current);
      clickTimer.current = setTimeout(() => {
        suppressClick.current = false;
      }, 800);
    };
    const open = (
      point: Point,
      trigger: Menu["trigger"],
      extra: {
        pointerId?: number;
        code?: string
      } = {}) => {
      clearPending();
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      session.current = {
        position: clampQuickPosition(point.x, point.y, innerWidth, innerHeight),
        anchor: point,
        active: trigger === "click" ? 1 : null,
        trigger,
        route,
        host: activeHost(),
        ...extra,
      };
      setMenu(session.current);
    };
    const cancel = () => {
      clearPending();
      close(false);
    };
    const requestOpen = (point: Point) => {
      if (!activeScope() || blockedOverlay()) return;

      if (session.current) {
        close();

        return;
      }

      open(point, "click");
    };
    const down = (event: PointerEvent) => {
      clearPending();
      suppressClick.current = false;
      clearTimeout(clickTimer.current);

      if (session.current) {
        if (!root.current?.contains(event.target as Node)) close(false);

        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const host = activeHost();

      if (!["both", "hold"].includes(preferences.trigger) || !target || !activeScope() || blockedOverlay()
        || host !== document.body && !host.contains(target)) return;

      const blocked = !!target.closest(
        `${editable},button,a,label,summary,[role=button],[role=link],[draggable=true],[data-long-press-selection]`,
      );

      if (
        !canStartQuickHold({
          button: event.button,
          primary: event.isPrimary,
          pointerType: event.pointerType,
          blocked,
          hasSelection: !window.getSelection()?.isCollapsed,
        })
      )
        return;

      pending = { x: event.clientX, y: event.clientY, id: event.pointerId, host: activeHost() };
      timer = setTimeout(() => {
        if (!activeScope() || blockedOverlay() || pending?.host !== activeHost()) {
          cancel();

          return;
        }

        if (pending && window.getSelection()?.isCollapsed) open(pending, "pointer", { pointerId: pending.id });
      }, QUICK_HOLD_MS);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;

      lastPointer = { x: event.clientX, y: event.clientY };

      const current = session.current;

      if (current && current.trigger !== "click") {
        if (current.trigger === "pointer" && event.pointerId !== current.pointerId) return;

        select(quickDirection(event.clientX - current.anchor.x, event.clientY - current.anchor.y));
      } else if (pending && event.pointerId === pending.id && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 8) clearPending();
    };
    const up = (event: PointerEvent) => {
      clearPending();

      const current = session.current;

      if (current?.trigger !== "pointer" || event.pointerId !== current.pointerId || event.button !== 0) return;

      guardClick();
      choose(quickDirection(event.clientX - current.anchor.x, event.clientY - current.anchor.y));
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current || event.detail === 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick.current = false;
      clearTimeout(clickTimer.current);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearPending();

        if (session.current) {
          event.preventDefault();
          close();
        }

        return;
      }

      if (!["both", "keyboard"].includes(preferences.trigger) || !activeScope()
        || (event.target instanceof Element && event.target.closest(editable))
        || blockedOverlay()) return;

      if (!matchesQuickShortcut(event, preferences.shortcut)) return;

      event.preventDefault();

      if (session.current) close();
      else open(lastPointer ?? { x: innerWidth / 2, y: innerHeight / 2 }, "keyboard", { code: event.code });
    };
    const keyUp = (event: KeyboardEvent) => {
      if (session.current?.trigger === "keyboard" && event.code === session.current.code) choose(session.current.active);
    };
    const unsubscribeRequests = subscribeQuickSwitch(requestOpen);

    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("scroll", cancel, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    window.addEventListener("click", click, true);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("resize", cancel);
    document.addEventListener("close", cancel, true);

    return () => {
      clearPending();
      close(false);
      unsubscribeRequests();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("scroll", cancel, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
      window.removeEventListener("click", click, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("resize", cancel);
      document.removeEventListener("close", cancel, true);
    };
  }, [route, preferences.trigger, preferences.shortcut, close, choose, select]);

  useEffect(() => () => clearTimeout(clickTimer.current), []);

  return { menu, root, close, choose, select };
}

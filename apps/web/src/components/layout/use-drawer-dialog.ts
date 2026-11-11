"use client";

import { useLayoutEffect, useRef } from "react";

type Visual = Readonly<{
  opacity: string;
  transform: string
}>;

export function useDrawerDialog(open: boolean, onClosed: (dialog: HTMLDialogElement, returnFocus: boolean) => void) {
  const dialog = useRef<HTMLDialogElement>(null);
  const afterClose = useRef(onClosed);
  const visual = useRef<Visual | null>(null);

  useLayoutEffect(() => {
    afterClose.current = onClosed;
  });

  useLayoutEffect(() => {
    const element = dialog.current;

    if (!element) return;

    const narrow = matchMedia("(max-width: 800px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | null = null;
    let generation = 0;

    const cancel = () => {
      if (!animation) return;

      const style = getComputedStyle(element);

      visual.current = { opacity: style.opacity, transform: style.transform };
      animation.cancel();
      animation = null;
    };
    const sync = () => {
      const current = ++generation;

      cancel();

      const wasOpen = element.open;

      if (!open && !wasOpen) {
        element.dataset.drawerState = "closed";

        return;
      }

      if (open && (!wasOpen || element.matches(":modal") !== narrow.matches)) {
        if (wasOpen) element.close();

        if (narrow.matches) element.showModal(); else element.show();
      }

      const hidden = { opacity: "0", transform: narrow.matches ? "translateY(32px)" : "translateX(40px)" };
      const shown = { opacity: "1", transform: "none" };
      const finish = () => {
        if (current !== generation) return;

        element.dataset.drawerState = open ? "open" : "closed";
        visual.current = null;

        if (!open) {
          const returnFocus = element.contains(document.activeElement) || document.activeElement === document.body;

          element.close();
          afterClose.current(element, returnFocus);
        }

        animation?.cancel();
        animation = null;
      };

      element.dataset.drawerState = open ? "opening" : "closing";

      if (reduced.matches) {
        finish();

        return;
      }

      animation = element.animate([visual.current ?? (wasOpen ? shown : hidden), open ? shown : hidden], {
        duration: 260,
        easing: "cubic-bezier(.22, 1, .36, 1)",
        fill: "both",
      });
      void animation.finished.then(finish, () => { });
    };

    if (open && element.open && !element.contains(document.activeElement)) {
      element.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus({ preventScroll: true });
    }

    sync();
    narrow.addEventListener("change", sync);
    reduced.addEventListener("change", sync);

    return () => {
      ++generation;
      cancel();
      narrow.removeEventListener("change", sync);
      reduced.removeEventListener("change", sync);
    };
  }, [dialog, open]);

  useLayoutEffect(() => () => {
    if (dialog.current?.open) dialog.current.close();
  }, [dialog]);

  return dialog;
}

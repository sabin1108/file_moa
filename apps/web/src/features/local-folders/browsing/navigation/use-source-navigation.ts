"use client";

import { useEffect } from "react";
import type { SourceNavigationController, ViewportPosition } from "./source-navigation-controller";

const key = "moaFileVisit";

/** 브라우저 history/DOM adapter. Next의 내부 필드는 보존하고 경로·파일 이름은 저장하지 않는다. */

export function useSourceNavigation(navigation: SourceNavigationController) {
  useEffect(() => {
    const previousScrollRestoration = history.scrollRestoration;

    history.scrollRestoration = "manual";

    let frame = 0;
    let disposed = false;
    const active = () => !disposed && location.pathname === "/files";
    const restore = (position: ViewportPosition) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!active()) return;

        const target = position.focusLabel
          ? [...document.querySelectorAll<HTMLElement>("[aria-label]")]
            .find(el => el.getAttribute("aria-label") === position.focusLabel && el.getClientRects().length && !el.matches(":disabled"))
          : null;

        (target ?? document.querySelector<HTMLElement>("[data-preview-phase] h2, [data-listing-phase] h2"))?.focus({ preventScroll: true });
        window.scrollTo(0, position.scrollY);
      });
    };

    void navigation.attach({
      read: () => {
        const value: unknown = history.state?.[key];

        return typeof value === "string" ? value : null;
      },
      write: (id, replace) => {
        // 초기 child effect는 Next의 history wrapper 설치보다 먼저 실행될 수 있다.
        // URL은 바꾸지 않으며 이미 존재하는 라우터/다른 소유자의 필드는 값 그대로 보존한다.
        const existing: unknown = history.state;
        const next = { ...(existing && typeof existing === "object" ? existing : {}), [key]: id };

        if (replace) history.replaceState(next, ""); else history.pushState(next, "");
      },
      back: () => history.back(),
      active,
      capture: () => ({ scrollY: window.scrollY, focusLabel: document.activeElement?.getAttribute("aria-label") ?? null }),
      restore,
    });

    const pop = () => {
      void navigation.pop();
    };

    window.addEventListener("popstate", pop);

    return () => {
      navigation.detach();
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("popstate", pop);
      history.scrollRestoration = previousScrollRestoration;
    };
  }, [navigation]);
}

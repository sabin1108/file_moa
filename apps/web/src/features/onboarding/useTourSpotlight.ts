"use client";

import { useEffect, useState } from "react";

type Spotlight = { top: number; left: number; width: number; height: number };

/** Re-measure the actual control after routing, scrolling and delayed page content. */
export function useTourSpotlight(selector: string, active: boolean) {
  const [rect, setRect] = useState<Spotlight | null>(null);

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    let scrolled: HTMLElement | undefined;
    const update = () => {
      const target = [...document.querySelectorAll<HTMLElement>(selector)].find(node => node.checkVisibility());

      if (target && target !== scrolled) {
        scrolled = target;
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      }

      const box = target?.getBoundingClientRect();

      if (!box || !box.width || !box.height) { setRect(null); return; }

      const top = Math.max(4, box.top - 4);
      const left = Math.max(4, box.left - 4);
      const right = Math.min(innerWidth - 4, box.right + 4);
      const bottom = Math.min(innerHeight - 4, box.bottom + 4);

      setRect(right > left && bottom > top ? { top, left, width: right - left, height: bottom - top } : null);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);

    schedule();
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [selector, active]);

  return active ? rect : null;
}

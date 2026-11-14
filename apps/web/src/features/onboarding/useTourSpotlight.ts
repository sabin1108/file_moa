"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { tourCardPosition, type TourRect } from "./tour-card-position";

/** Track moving controls only while guidance is visible; unchanged bounds do not render again. */
export function useTourSpotlight(selector: string, active: boolean, ready = true) {
  const [measured, setMeasured] = useState<{ selector: string; rect: TourRect | null } | null>(null);

  useEffect(() => {
    if (!active || !ready) return;

    let frame = 0;
    let scrolled: HTMLElement | undefined;
    let previous = "";
    const update = () => {
      const target = [...document.querySelectorAll<HTMLElement>(selector)].find(node => node.checkVisibility());

      if (target && target !== scrolled) {
        scrolled = target;
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      }

      const box = target?.getBoundingClientRect();

      const top = Math.max(4, (box?.top ?? 0) - 4);
      const left = Math.max(4, (box?.left ?? 0) - 4);
      const right = Math.min(innerWidth - 4, (box?.right ?? 0) + 4);
      const bottom = Math.min(innerHeight - 4, (box?.bottom ?? 0) + 4);
      const rect = box?.width && box.height && right > left && bottom > top ? { top, left, width: right - left, height: bottom - top } : null;
      const signature = JSON.stringify(rect);

      if (signature !== previous) { previous = signature; setMeasured({ selector, rect }); }

      frame = requestAnimationFrame(update);
    };

    frame = requestAnimationFrame(update);

    return () => cancelAnimationFrame(frame);
  }, [selector, active, ready]);

  return { rect: active ? measured?.rect ?? null : null, settled: ready && measured?.selector === selector && !!measured.rect };
}

export function useTourCardPosition(card: RefObject<HTMLElement | null>, target: TourRect | null, active: boolean) {
  const [position, setPosition] = useState<ReturnType<typeof tourCardPosition> | null>(null);

  useLayoutEffect(() => {
    const element = card.current;

    if (!active || !element) return;

    const measure = () => {
      if (!element.checkVisibility()) return;

      setPosition(previous => {
        const copy = element.querySelector<HTMLElement>("[data-tour-copy]");
        const overflow = copy ? copy.scrollHeight - copy.clientHeight : 0;
        const next = tourCardPosition(target, { width: element.offsetWidth, height: element.offsetHeight + overflow }, { width: innerWidth, height: innerHeight });

        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
      });
    };
    const observer = new ResizeObserver(measure);

    measure();
    observer.observe(element);
    window.addEventListener("resize", measure);

    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [card, target, active]);

  return position;
}

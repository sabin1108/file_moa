"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { WorkflowStep } from "./WorkflowStepper";

export type PaperFlight = Readonly<{
  id: number;
  index: number;
  label: string;
  direction: "in" | "out";
  duration: number;
  open: boolean;
}>;

type Motion = {
  flights: readonly PaperFlight[];
  enter: "slide" | "yank" | "none";
  duration: number
};

const still: Motion = { flights: [], enter: "none", duration: 0 };

/** 실제 단계는 호출자가 소유하고, 이 hook은 장식 비행·축소·취소 수명만 관리한다. */

export function usePaperStepperMotion(
  steps: readonly WorkflowStep[],
  active: number,
  wrap: RefObject<HTMLDivElement | null>,
  target?: Element | null) {
  const scope = JSON.stringify(steps.map(step => step.id));
  const stepLabel = steps[active]?.label ?? "";
  const previous = useRef({ scope, active, label: stepLabel });
  const sequence = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [scale, setScale] = useState(.5);
  const [motion, setMotion] = useState<Motion>(still);

  useLayoutEffect(() => {
    const node = wrap.current;

    if (!node) return;

    const fit = () => {
      if (node.clientWidth > 0) setScale(Math.min(1, node.clientWidth / 600));
    };

    fit();

    const observer = new ResizeObserver(fit);

    observer.observe(node);

    return () => observer.disconnect();
  }, [wrap, target]);

  useEffect(() => {
    const pendingTimers = timers.current;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (!media.matches) return;

      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
      setMotion(still);
    };

    media.addEventListener("change", stop);

    return () => {
      media.removeEventListener("change", stop);
      pendingTimers.forEach(clearTimeout);
      pendingTimers.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const before = previous.current;

    previous.current = { scope, active, label: stepLabel };

    if (before.scope === scope && before.active === active) return;

    if (before.scope !== scope || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      setMotion(still);

      return;
    }

    const forward = active > before.active;
    const id = ++sequence.current;
    const index = forward ? before.active : active;
    const duration = forward ? 3000 : 1100;
    const flight: PaperFlight = {
      id,
      index,
      label: forward ? before.label : stepLabel,
      direction: forward ? "in" : "out",
      duration,
      open: false
    };

    setMotion(current => ({
      flights: [...current.flights.filter(item => item.index !== index), flight],
      enter: forward ? "slide" : "yank",
      duration: forward ? 0 : duration,
    }));

    const later = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        callback();
      }, delay);

      timers.current.add(timer);
    };
    const lid = (open: boolean) => setMotion(current => ({ ...current, flights: current.flights.map(item => item.id === id ? { ...item, open } : item) }));

    later(() => lid(true), forward ? duration * .5 : 0);
    later(() => lid(false), duration * (forward ? .92 : .3));
    later(
      () => setMotion(current => ({ ...current, flights: current.flights.filter(item => item.id !== id) })),
      duration
    );
  }, [active, scope, stepLabel]);

  return { ...motion, scale };
}

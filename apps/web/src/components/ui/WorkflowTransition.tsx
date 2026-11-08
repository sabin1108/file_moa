"use client";
import { useLayoutEffect, useRef, type HTMLAttributes } from "react";

/** 본문과 입력 상태는 유지하고 실제 단계가 바뀔 때만 높이·등장을 연결한다. */
export function WorkflowTransition({ step, children, ...props }: HTMLAttributes<HTMLDivElement> & { step: string | number }) {
  const element = useRef<HTMLDivElement>(null);
  const previous = useRef<{ step: string | number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const height = node.getBoundingClientRect().height;
    let animation: Animation | undefined;
    if (previous.current && previous.current.step !== step && height > 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animation = node.animate([
        { opacity: 0.55, transform: "translateY(6px)", height: `${previous.current.height || height}px` },
        { opacity: 1, transform: "translateY(0)", height: `${height}px` },
      ], { duration: 260, easing: "cubic-bezier(.22, 1, .36, 1)" });
    }
    previous.current = { step, height };
    return () => animation?.cancel();
  }, [step]);
  return <div {...props} ref={element} data-workflow-transition={step}>{children}</div>;
}

"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WorkflowStep } from "./WorkflowStepper";
import { usePaperStepperMotion } from "./use-paper-stepper-motion";
import styles from "./paper-stepper.module.css";

function PaperBody({ label, index, total }: {
  label: string;
  index: number;
  total: number
}) {
  return <div className={styles.pBody}>
    <span className={styles.pLabel}>{index + 1} / {total}</span>
    <p className={styles.pTitle}>진행 단계</p>
    <span className={styles.pField}>{label}</span>
  </div>;
}

function Quad({ position, back = false, children }: {
  position: "pTL" | "pTR" | "pBR" | "pBL";
  back?: boolean;
  children: ReactNode
}) {
  return <div className={`${styles.q} ${styles[position]}`}>
    <div className={styles.qFace}>{children}</div>
    {back && <div className={styles.qBack} />}
  </div>;
}

/** 인증 상태·URL·입력값을 소유하지 않는 종이/폴더 단계 표시다. */

export function PaperStepper({ steps, current, label = "작업 진행 단계" }: {
  steps: readonly WorkflowStep[];
  current: string;
  label?: string;
}) {
  const active = Math.max(0, steps.findIndex(step => step.id === current));
  const root = useRef<HTMLElement>(null);
  const [target, setTarget] = useState<Element | null>(null);

  useLayoutEffect(() => {
    setTarget(root.current?.closest("[data-auth-shell]")?.querySelector("[data-auth-illustration]") ?? null);
  }, []);

  const wrap = useRef<HTMLDivElement>(null);
  const motion = usePaperStepperMotion(steps, active, wrap, target);

  if (!steps.length) return null;

  const stored = Math.max(0, active - motion.flights.filter(flight => flight.direction === "in").length);
  const complete = active === steps.length - 1 && motion.flights.length === 0;

  const visual = <div
    ref={wrap}
    data-paper-visual
    className={`${styles.kit} ${styles.wrap}`}
    style={{ "--s": motion.scale } as CSSProperties}
    aria-hidden="true"
  >
    <div className={styles.stage} data-phase={complete ? "done" : "input"}>
      <div className={styles.dots}>{steps.map((step, index) => <i key={step.id} data-on={index <= active} />)}</div>
      <div
        key={current}
        className={styles.sheet}
        data-enter={motion.enter}
        style={{ "--T": `${motion.duration}ms` } as CSSProperties}
      >
        <PaperBody label={steps[active].label} index={active} total={steps.length} />
      </div>
      <div className={styles.folder}>
        <div className={styles.back} />
        {Array.from(
          { length: Math.min(stored, 3) },
          (_, index) => <div key={index} className={styles.peek} style={{ "--k": index } as CSSProperties} />
        )}
        <div className={styles.front} data-open={motion.flights.some(flight => flight.open)} />
        {stored > 0 && <span key={stored} className={styles.count}>{stored}</span>}
        <svg className={styles.check} viewBox="0 0 30 30"><circle cx="15" cy="15" r="15" /><path d="M9 15.5l4 4 8-9" /></svg>
      </div>
      <p className={styles.folderName}>{label}</p>
      {motion.flights.map(flight => {
        const body = <PaperBody label={flight.label} index={flight.index} total={steps.length} />;

        return <div
          key={flight.id}
          className={styles.paper}
          data-paper-flight={flight.direction}
          data-yank={flight.direction === "out"}
          style={{ "--dir": "normal", "--T": `${flight.duration}ms` } as CSSProperties}
        >
          <Quad position="pTL">{body}</Quad>
          <div className={styles.colR}>
            <Quad position="pTR">{body}</Quad>
            <Quad position="pBR" back>{body}</Quad>
            <div className={styles.colBack} />
          </div>
          <Quad position="pBL" back>{body}</Quad>
        </div>;
      })}
    </div>
  </div>;

  return <nav ref={root} className={styles.stepper} aria-label={label} data-paper-stepper>
    <ol className={styles.steps}>
      {steps.map((step, index) => <li
        key={step.id}
        data-state={index < active ? "done" : index === active ? "current" : "pending"}
        aria-current={index === active ? "step" : undefined}
      >
        <span aria-hidden="true">{index + 1}.</span> {step.label}
      </li>)}
    </ol>
    {target ? createPortal(visual, target) : visual}
    <p className={styles.status} role="status">{active + 1} / {steps.length} · {steps[active].label}</p>
  </nav>;
}

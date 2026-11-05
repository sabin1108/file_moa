import type { Ref } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { WorkflowStepper, type WorkflowStep } from "../../../../components/ui/WorkflowStepper";
import styles from "./file-change-plan.module.css";

export function FileOperationHeader({ title, titleId, titleRef, description, source, count, steps, current, onClose, closeLabel, closeAriaLabel }: {
  title: string; titleId: string; titleRef: Ref<HTMLHeadingElement>; description: string;
  source: readonly string[]; count: number; steps: readonly WorkflowStep[]; current: string;
  onClose: () => void; closeLabel: string; closeAriaLabel?: string;
}) {
  return <>
    <header className={styles.header}>
      <h2 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h2>
      <button type="button" className={actionClasses("secondary")} aria-label={closeAriaLabel} onClick={onClose}>{closeLabel}</button>
    </header>
    <p className={styles.scope}>{description}</p>
    <p className={styles.source}>선택 {count.toLocaleString("ko-KR")}개 · {source.join(" / ")}</p>
    <WorkflowStepper steps={steps} current={current} label="복사·이동 진행 단계" />
  </>;
}

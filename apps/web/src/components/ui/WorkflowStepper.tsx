import styles from "./workflow-stepper.module.css";

export type WorkflowStep = Readonly<{ id: string; label: string }>;
/** 단계의 의미/실행 권한을 소유하지 않는 파일·복구 작업의 공통 표시다. */
export function WorkflowStepper({ steps, current, label = "작업 진행 단계" }: {
  steps: readonly WorkflowStep[]; current: string; label?: string;
}) {
  const active = Math.max(0, steps.findIndex(step => step.id === current));
  return <nav aria-label={label} className={styles.stepper}>
    <ol>{steps.map((step, index) => <li key={step.id} data-state={index < active ? "done" : index === active ? "current" : "pending"}
      aria-current={index === active ? "step" : undefined}>
      <span className={styles.number} aria-hidden="true">{index < active ? "✓" : index + 1}</span>
      <span>{step.label}</span>
    </li>)}</ol>
    <div className={styles.track} aria-hidden="true"><span style={{ transform: `scaleX(${steps.length > 1 ? active / (steps.length - 1) : 1})` }} /></div>
    <p role="status">{active + 1} / {steps.length} · {steps[active]?.label}</p>
  </nav>;
}

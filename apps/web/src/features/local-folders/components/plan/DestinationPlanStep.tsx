import type { Ref, ReactNode } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { actionClasses } from "../../../../components/ui/action-classes";
import styles from "./file-change-plan.module.css";

/** 파일/폴더의 목적지·계획 입력을 공유한다. 실제 검사는 호출자가 소유한다. */
export function DestinationPlanStep({ operation, onOperationChange, folderName, destination, confirmed,
  onBrowse, buttonRef, pickerId, pending, hasPlan, onPlan, onCancel, children }: {
  operation: "copy" | "move"; onOperationChange: (operation: "copy" | "move") => void;
  folderName: string; destination: readonly string[]; confirmed: boolean; onBrowse: () => void;
  buttonRef?: Ref<HTMLButtonElement>; pickerId?: string; pending: boolean; hasPlan: boolean;
  onPlan: () => void; onCancel: () => void; children?: ReactNode;
}) {
  return <>
    <section className={styles.destinationStep} aria-label="목적지 지정">
      <div className={styles.operationRow}>
        <h3>1. 목적지 지정</h3>
        <label>작업 <select value={operation} disabled={pending} onChange={event => {
          const value = event.target.value;
          if (value === "copy" || value === "move") onOperationChange(value);
        }}><option value="copy">복사</option><option value="move">이동</option></select></label>
      </div>
      <button ref={buttonRef} type="button" className={styles.destinationField} data-confirmed={confirmed}
        disabled={pending} aria-label="목적지 선택" aria-controls={pickerId} aria-expanded={false} onClick={onBrowse}>
        <Icon name="folder" size={24} />
        <span><strong>{confirmed ? [folderName, ...destination].join(" / ") : "목적지를 먼저 선택해 주세요"}</strong>
          <small>{confirmed ? "다른 폴더로 변경" : "폴더 탐색 또는 경로 직접 입력"}</small></span>
        <Icon name="chevron" />
      </button>
    </section>
    <h3 className={styles.planStepTitle}>2. 계획 확인</h3>
    <div className={styles.actions}>
      <button type="button" className={actionClasses(hasPlan ? "secondary" : "primary")} disabled={!confirmed || pending} onClick={onPlan}>
        {pending ? "계획 확인 중…" : hasPlan ? "계획 다시 확인" : "계획 만들기"}
      </button>
      {pending && <button type="button" className={actionClasses("secondary")} onClick={onCancel}>계획 읽기 취소</button>}
    </div>
    {children}
  </>;
}

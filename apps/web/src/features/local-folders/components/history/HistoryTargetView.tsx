import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { HistoryGroup } from "../../lib/folder-history";
import type { TargetInspectionState } from "../../store/folder-history-controller";
import styles from "./folder-history.module.css";

const issues = {
  permission: "읽기 권한이 필요해요. 연결 관리에서 다시 연결해 주세요.",
  record: "기록이 바뀌었어요. 작업 기록을 새로고침해 주세요.",
  changed: "확인하는 동안 폴더나 대상이 바뀌었어요. 다시 확인해 주세요.",
  missing: "확인할 부모 폴더를 찾지 못했어요. 폴더 목록을 새로고침해 주세요.",
  read: "현재 상태를 확인하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
};

/** 과거 기록과 현재 관측을 분리한다. 현재 존재 여부를 작업 성공/실패로 바꾸지 않는다. */
export function HistoryTargetView({ group, state, onInspect, onCancel }: {
  group: HistoryGroup; state: TargetInspectionState | null; onInspect: (id: string) => void; onCancel: () => void;
}) {
  if (!group.path || !group.kind) return <p className={styles.note}>경로 또는 종류 기록이 서로 달라 현재 대상을 지정할 수 없어요.</p>;
  const pending = state?.phase === "loading";
  const result = state?.result;
  const actual = result?.actualKind === "directory" ? "폴더가" : "파일이";
  const title = result?.status === "missing" ? "지금은 이 이름의 항목이 없어요."
    : result?.status === "kind-mismatch" ? `기록과 다른 종류의 ${actual} 있어요.` : `기록한 위치에 ${actual} 있어요.`;
  return <div className={styles.inspection} data-target-phase={state?.phase ?? "idle"}>
    <button type="button" className={actionClasses("secondary")} aria-label={`${group.path.at(-1)} ${pending ? "현재 상태 확인 취소" : "현재 상태 확인"}`}
      onClick={pending ? onCancel : () => onInspect(group.id)}>{pending ? "확인 취소" : "현재 상태 확인"}</button>
    {pending && <StatusNotice state="pending" title="기록과 현재 대상을 확인하고 있어요." />}
    {state?.phase === "cancelled" && <StatusNotice state="attention" title="현재 상태 확인을 취소했어요." />}
    {state?.phase === "error" && state.issue && <StatusNotice state="attention" title={issues[state.issue]} />}
    {result && <StatusNotice state={result.status === "present" ? "success" : "attention"} title={title}
      detail={`확인 시각 · ${new Date(result.checkedAt).toLocaleString("ko-KR", { hour12: false })}. 생성 주체나 과거 성공·실패를 판정한 결과는 아닙니다.`} />}
  </div>;
}

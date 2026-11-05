import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { Icon } from "../../../../components/ui/Icon";
import type { CopyExecution } from "../../services/copy-execution";
import styles from "./file-change-plan.module.css";

const labels = { "not-run": "미실행", started: "복사 중", verified: "복사 확인", uncertain: "결과 미확인" };
const phases = { preparing: "원본과 목적지를 다시 확인하고 있어요.", copying: "파일을 복사하고 있어요.", completed: "복사를 완료했어요.", cancelled: "복사를 중단했어요.", error: "복사를 끝내지 못했어요." };
const issues: Record<string, string> = {
  permission: "쓰기 권한을 확인해 주세요.", "source-changed": "검사 후 원본이 바뀌었어요. 계획과 내용을 다시 검사해 주세요.",
  "copy-conflict": "목적지에 이름 충돌이나 변경이 생겨 중단했어요. 파일별 결과를 확인해 주세요.",
  "copy-history-full": "작업 기록의 조회 한도에 도달해 복사를 시작하지 않았어요.",
  "copy-verification": "복사한 내용이 원본 검사 결과와 일치하지 않아요. 해당 파일은 미확인으로 남겼습니다.",
};

export function CopyExecutionView({ result, running, cancelling, issue, start, cancel }: {
  result: CopyExecution | null; running: boolean; cancelling: boolean; issue: boolean; start: () => void; cancel: () => void;
}) {
  return <section aria-label="복사 실행" data-copy-execution={running ? "running" : result?.phase ?? "ready"}>
    {!result && !running && !issue && <>
      <p className={styles.note}>원본은 유지하고 위 목적지에 같은 이름으로 복사합니다. 작업 기록도 목적지에 저장합니다.</p>
      <button type="button" className={actionClasses("primary")} onClick={start}>이 계획대로 복사</button>
    </>}
    {running && <button type="button" className={actionClasses("secondary")} onClick={cancel} disabled={cancelling}>{cancelling ? "중단 결과 확인 중" : "복사 중단"}</button>}
    {running && <div className={styles.copyMotion} aria-hidden="true"><Icon name="file" size={24} /><Icon name="copy" size={22} className={styles.travellingFile} /><Icon name="chevron" /><Icon name="folder" size={28} /></div>}
    {issue && <StatusNotice state="error" title="복사를 시작하지 못했어요. 파일을 다시 검사해 주세요." />}
    {result && <>
      <StatusNotice state={running ? "pending" : result.phase === "completed" ? "success" : "attention"} title={phases[result.phase]}
        detail={result.issue ? issues[result.issue] ?? "파일별 결과를 확인해 주세요. 미확인 파일은 자동으로 삭제하거나 다시 복사하지 않습니다." : undefined} />
      <ul className={styles.rows}>{result.items.map(item => <li key={item.itemId}><strong>{item.to.at(-1)}</strong><p>{labels[item.status]}</p></li>)}</ul>
      {!running && <p className={styles.note}>{result.journalComplete ? "목적지의 작업 기록에서 이 결과를 다시 볼 수 있어요." : "기록을 확정하지 못했을 수 있어요. 목적지의 작업 기록과 현재 파일을 확인해 주세요."}</p>}
    </>}
  </section>;
}

import { StatusLabel } from "../../../../components/ui/StatusLabel";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { RestoreHistory } from "../../lib/recovery-restore-history";
import type { RestoreInspectionState } from "../../store/folder-history-controller";
import { actionClasses } from "../../../../components/ui/action-classes";
import styles from "./folder-history.module.css";

const statuses = {
  completed: "복원 완료 기록",
  cancelled: "중단 기록",
  error: "실패 기록",
  uncertain: "확인 필요",
};

const fileStatuses = {
  "not-run": "미실행 기록",
  uncertain: "결과 확인 필요",
  verified: "복원 검증 기록",
};

/** 목적지에 저장된 과거 결과를 표시한다. 현재 파일 검사나 복원 실행을 제공하지 않는다. */
export function RestoreHistoryView({ history, inspection, onInspect }: {
  history: RestoreHistory; inspection?: RestoreInspectionState | null; onInspect?: (id: string) => void;
}) {
  return <section aria-label="복원 작업 기록">
    {history.incomplete && <StatusNotice
      state="attention"
      title="복원 기록 일부를 확인하지 못했어요."
      detail="읽기 한도나 잘못된 기록이 있어 표시된 결과를 확인 필요로 남겼습니다."
    />}
    {history.excluded > 0 && <p className={styles.note}>
      다른 사용자 또는 작업 공간의 복원 기록 {history.excluded}개를 제외했어요.
    </p>}
    {!history.groups.length && <p className={styles.empty}>
      {history.incomplete ? "이 위치에서 표시할 복원 기록을 확인하지 못했어요." : "이 위치에 표시할 복원 기록이 없어요."}
    </p>}
    {history.groups.length > 0 && <>
      <p className={styles.note}>저장된 과거 복원 결과입니다. 현재 파일 확인은 별도로 실행하며 과거 기록은 바꾸지 않습니다.</p>
      <ol className={styles.list}>
        {history.groups.map(group => <li key={group.id}>
          <details className={styles.record}>
            <summary>
              <strong>{group.to?.at(-1) ?? "복원 파일 확인 불가"}</strong>
              <StatusLabel emphasis={group.status !== "completed"}>{statuses[group.status]}</StatusLabel>
              {group.time && <time dateTime={group.time}>{new Date(group.time).toLocaleString("ko-KR", { hour12: false })}</time>}
            </summary>
            <dl>
              <dt>원래 위치</dt><dd>{group.from?.join(" / ") ?? "확인할 수 없음"}</dd>
              <dt>복원 위치</dt><dd>{group.to?.join(" / ") ?? "확인할 수 없음"}</dd>
              <dt>기록 시각</dt><dd>{group.time ? new Date(group.time).toLocaleString("ko-KR", { hour12: false }) : "확인할 수 없음"}</dd>
              <dt>용량</dt><dd>{group.size === null ? "확인할 수 없음" : `${group.size.toLocaleString("ko-KR")} bytes`}</dd>
              <dt>저장된 파일 결과</dt><dd>{fileStatuses[group.fileStatus]}</dd>
            </dl>
            {!history.incomplete && group.status === "completed" && group.fileStatus === "verified" && group.to && group.sha256 && onInspect && <button
              type="button" className={actionClasses("secondary")} onClick={() => onInspect(group.id)}
            >{inspection?.id === group.id && inspection.phase === "loading" ? "현재 파일 확인 취소" : "현재 파일 확인"}</button>}
            {inspection?.id === group.id && <div role="status">
              {inspection.phase === "loading" && <p>현재 파일을 확인하고 있어요.</p>}
              {inspection.phase === "cancelled" && <p>확인을 취소했어요.</p>}
              {inspection.phase === "error" && <p>확인하지 못했어요. 권한과 기록을 다시 확인해 주세요.</p>}
              {inspection.result && <p>현재 관측 · {{ matches: "복원 당시 내용과 일치", different: "내용이 변경됨", missing: "현재 파일 없음", directory: "같은 이름의 폴더가 있음" }[inspection.result.status]} · {new Date(inspection.result.time).toLocaleString("ko-KR")}</p>}
            </div>}
            {group.status === "uncertain" && <p className={styles.note}>기록이 누락되었거나 서로 맞지 않아 완료 여부를 확정하지 않습니다.</p>}
            {(group.status === "cancelled" || group.status === "error") && group.fileStatus === "uncertain" &&
              <p className={styles.note}>일부 파일이 남아 있을 수 있습니다. 이 화면에서 자동으로 재실행하거나 삭제하지 않습니다.</p>}
            <details>
              <summary>작업 식별 정보</summary>
              <p className={styles.note}>{group.id} · 기록 {group.count}개</p>
            </details>
          </details>
        </li>)}
      </ol>
    </>}
  </section>;
}

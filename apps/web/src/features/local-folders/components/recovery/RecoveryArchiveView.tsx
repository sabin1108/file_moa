import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { RecoveryArchiveController, RecoveryArchiveState } from "../../store/recovery-archive-controller";
import { historyTime } from "../history/FolderHistoryView";
import styles from "../history/folder-history.module.css";

const recorded = { completed: "백업 완료 기록", incomplete: "불완전한 기록", invalid: "읽을 수 없는 기록" };
const statuses = { verified: "정상", damaged: "손상", uncertain: "확인 필요" };
const payloads = { verified: "크기·내용 일치", missing: "보관본 없음", damaged: "크기 또는 내용 불일치", "not-checked": "검사하지 못함" };
const journals = { verified: "양쪽 기록 일치", incomplete: "기록 불완전", unavailable: "원래 위치의 기록 확인 불가", changed: "기록 또는 위치 변경" };

/** 보관된 파일의 metadata와 현재 검사 결과만 표시한다. 본문/핸들은 받지 않는다. */
export function RecoveryArchiveView({ state, controller }: { state: RecoveryArchiveState; controller: RecoveryArchiveController }) {
  const list = state.list;
  if (!list) return null;
  return <>
    <p className={styles.note}>{list.items.length.toLocaleString("ko-KR")}개 표시 · 실제 복구 사본은 확인 버튼을 눌러 검사하세요.</p>
    {list.truncated && <StatusNotice state="attention" title="일부 기록만 표시했습니다." detail="읽기 한도에 도달했습니다. 전체 목록으로 판단하지 마세요." />}
    {!list.items.length && !list.truncated && <p className={styles.empty}>아직 보관된 복구 사본이 없습니다.</p>}
    <ol className={styles.list} aria-label="보관된 복구 사본">
      {list.items.map(item => {
        const detail = state.detail?.id === item.id ? state.detail : null;
        const outcome = detail?.result;
        return <li key={item.id}>
          <details className={styles.record}>
            <summary aria-label={`${item.fileName ?? "읽을 수 없는 항목"} 복구 기록`}>
              <strong>{item.fileName ?? "확인할 수 없는 보관 기록"}</strong>
              {item.createdAt && <time dateTime={item.createdAt}>{historyTime(item.createdAt)}</time>}
              <span>{outcome ? statuses[outcome.status] : item.canInspect ? "검사 전" : "확인 필요"}</span>
            </summary>
            <dl>
              <dt>원래 위치</dt><dd>{item.originalPath?.join(" / ") ?? "—"}</dd>
              <dt>보관 시각</dt><dd>{item.createdAt ? historyTime(item.createdAt) : "—"}</dd>
              <dt>용량</dt><dd>{item.bytes === null ? "—" : `${item.bytes.toLocaleString("ko-KR")} bytes`}</dd>
              <dt>저장된 기록</dt><dd>{recorded[item.recorded]}</dd>
            </dl>
            {!item.canInspect && <p className={styles.note}>기록을 읽을 수 없어 이 항목은 확인할 수 없습니다.</p>}
            {item.canInspect && <div className={styles.inspection}>
              <button type="button" className={actionClasses("secondary")} disabled={detail?.phase === "loading"}
                onClick={() => { void controller.inspect(item.id); }}>{detail?.phase === "loading" ? "복구 사본 확인 중…" : outcome ? "복구 사본 다시 확인" : "복구 사본 확인"}</button>
              {detail?.phase === "loading" && <p role="status">보관본과 기록을 읽어 확인하고 있어요.</p>}
              {detail?.phase === "cancelled" && <p role="status">확인을 취소했어요.</p>}
              {detail?.phase === "error" && <StatusNotice state="attention" role="alert" title="확인하지 못했어요." detail="목록을 새로고침하거나 연결과 권한을 확인해 주세요." />}
              {outcome && <>
                <StatusNotice state={outcome.status === "verified" ? "success" : "attention"}
                  role={outcome.status === "verified" ? "status" : "alert"}
                  title={outcome.status === "verified" ? "복구 사본이 정상입니다." : outcome.status === "damaged" ? "복구 사본이 없거나 손상됐어요." : "추가 확인이 필요해요."}
                  detail={outcome.status === "verified" ? "이번 검사에서 보관본과 양쪽 기록을 확인했습니다."
                    : outcome.issue === "permission" ? "폴더 연결과 읽기 권한을 확인해 주세요." : "기록·파일·원래 위치를 확인하고 다시 검사해 주세요."} />
                <dl>
                  <dt>보관본</dt><dd>{payloads[outcome.payload]}</dd>
                  <dt>기록</dt><dd>{journals[outcome.journal]}</dd>
                  <dt>검사 시각</dt><dd>{historyTime(outcome.checkedAt)}</dd>
                </dl>
                {controller.restore && outcome.payload === "verified" && ["verified", "unavailable"].includes(outcome.journal) &&
                  <button type="button" className={actionClasses("primary")} onClick={() => {
                    void controller.restore?.open(item.id, []);
                  }}>복원 위치 선택</button>}
              </>}
            </div>}
          </details>
        </li>;
      })}
    </ol>
  </>;
}

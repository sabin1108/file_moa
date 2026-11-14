import { StatusLabel } from "../../../../components/ui/StatusLabel";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { CopyHistory } from "./copy-journal-storage";
import type { CopyHistoryInspectionState } from "../../history/folder-history-controller";
import { actionClasses } from "../../../../components/ui/action-classes";
import styles from "../../history/folder-history.module.css";

const statuses = {
  completed: "복사 완료 기록",
  cancelled: "중단 기록",
  error: "일부 실패 기록",
  uncertain: "결과 미확인"
};

const items = {
  verified: "복사 확인",
  "not-run": "미실행",
  started: "결과 미확인",
  uncertain: "결과 미확인"
};

const observations = {
  matches: "현재 내용 일치",
  different: "현재 내용 다름",
  missing: "현재 파일 없음",
  directory: "같은 이름의 폴더"
};

export function CopyHistoryView({ history, inspection, onInspect, onCancel }: {
  history: CopyHistory;
  inspection: CopyHistoryInspectionState | null;
  onInspect?: (id: string) => void;
  onCancel?: () => void;
}) {
  if (!history.groups.length && !history.incomplete) {
    return null;
  }

  return (
    <section aria-label="복사 작업 기록">
      {history.incomplete
        && (
          <StatusNotice
            state="attention"
            title="복사 기록 일부를 확인하지 못했어요."
            detail="누락·손상·읽기 한도가 있는 기록은 결과 미확인으로 표시합니다."
          />
        )}
      <p className={styles.note}>
        저장된 작업 결과입니다. 현재 파일 상태나 생성 주체를 보장하지 않으며 자동으로 재실행하지
        않습니다.
      </p>
      <ol className={styles.list}>
        {history.groups.map(group => (
          <li key={group.id}>
            <details className={styles.record}>
              <summary>
                <strong>
                  {"파일 "}
                  {group.items.length}개 복사
                </strong>
                <StatusLabel emphasis={group.status !== "completed"}>
                  {statuses[group.status]}
                </StatusLabel>
                <time dateTime={group.time}>
                  {new Date(group.time).toLocaleString("ko-KR", { hour12: false })}
                </time>
              </summary>
              <p className={styles.note}>
                {"기록 시각 "}
                <time dateTime={group.time}>
                  {new Date(group.time).toLocaleString("ko-KR", { hour12: false })}
                </time>
              </p>
              <ul>
                {group.items.map(item => (
                  <li key={item.itemId}>
                    <strong>
                      {item.to.at(-1)}
                    </strong>
                    {" · "}
                    {items[item.status]}
                    <p>
                      {item.from.join(" / ")}
                      {" → "}
                      {item.to.join(" / ")}
                    </p>
                  </li>
                ))}
              </ul>
              {!history.incomplete && group.items.length > 0 && onInspect
                && (
                  <button
                    type="button"
                    className={actionClasses("secondary")}
                    onClick={() => {
                      if (inspection?.id === group.id && inspection.phase === "loading") {
                        onCancel?.();
                      } else {
                        onInspect(group.id);
                      }
                    }}
                  >
                    {inspection?.id === group.id && inspection.phase === "loading"
                      ? "내용 대조 취소"
                      : "현재 복사본 내용 대조"}
                  </button>
                )}
              {inspection?.id === group.id
                && (
                  <div data-copy-target-phase={inspection.phase}>
                    {inspection.phase === "loading"
                      && (
                        <p role="status">현재 복사본을 읽어 내용을 대조하고 있어요.</p>
                      )}
                    {inspection.phase === "error"
                      && (
                        <StatusNotice
                          state="attention"
                          title="내용을 대조하지 못했어요. 권한과 기록을 새로 확인해 주세요."
                        />
                      )}
                    {inspection.phase === "cancelled" && <p role="status">내용 대조를 취소했어요.</p>}
                    {inspection.result
                      && (
                        <>
                          <p className={styles.note}>
                            {"현재 관측 · "}
                            {new Date(inspection.result.time).toLocaleString("ko-KR")}
                            {" · 저장된 작업 결과는 바꾸지 않습니다."}
                          </p>
                          <ul>
                            {inspection.result.items.map(item => (
                              <li key={item.itemId}>
                                {group.items.find(i => i.itemId === item.itemId)?.to.at(-1)}
                                {" · "}
                                {observations[item.status]}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                  </div>
                )}
              <details>
                <summary>작업 식별 정보</summary>
                <p className={styles.note}>
                  {group.id}
                  {" · 기록 "}
                  {group.count}개
                </p>
              </details>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

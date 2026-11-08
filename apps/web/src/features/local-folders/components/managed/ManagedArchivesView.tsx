import { useState } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { ManagedFilesController, ManagedFilesState } from "../../store/managed-files-controller";
import styles from "../history/folder-history.module.css";

const kinds = { copy: "복사 보존본", move: "이동 보존본", trash: "휴지통", edit: "편집 전 버전", recover: "복구 보존본" };
export function ManagedArchivesView({ controller, state }: { controller: ManagedFilesController; state: ManagedFilesState }) {
  const [category, setCategory] = useState<"trash" | "backups">("trash");
  const items = state.archives.filter(item => category === "trash" ? item.kind === "trash" : item.kind !== "trash");
  return (
    <section aria-label="휴지통과 보존 기록">
      <div className={styles.categories} role="group" aria-label="보존 기록 종류">
        <button
          type="button"
          className={actionClasses(category === "trash" ? "primary" : "ghost")}
          aria-pressed={category === "trash"}
          onClick={() => setCategory("trash")}
        >
          휴지통
        </button>
        <button
          type="button"
          className={actionClasses(category === "backups" ? "primary" : "ghost")}
          aria-pressed={category === "backups"}
          onClick={() => setCategory("backups")}
        >
          이동·편집 등 보존본
        </button>
      </div>
      <p className={styles.note}>
        앱 보관함의 사본입니다. 자동으로 영구 삭제하지 않으며 복구 후에도 남겨 둡니다.
      </p>
      {(state.truncated || state.unreadable > 0) && (
        <StatusNotice
          state="attention"
          title="일부 보존 기록만 표시했습니다."
          detail={`읽지 못한 기록 ${state.unreadable}개. 현재 목록만으로 전체 보관 상태를 판단하지 마세요.`}
        />
      )}
      {!items.length && state.phase === "ready" && (
        <p className={styles.empty}>표시할 기록이 없습니다.</p>
      )}
      <ol className={styles.list}>
        {items.map(item => (
          <li key={item.id}>
            <details className={styles.record}>
              <summary>
                <strong>{item.roots.map(path => path.at(-1)).join(", ")}</strong>
                <span>{kinds[item.kind]}</span>
              </summary>
              <dl>
                <dt>원래 위치</dt>
                <dd>{item.roots.map(path => path.join(" / ")).join(", ")}</dd>
                <dt>보관 시각</dt>
                <dd>{new Date(item.time).toLocaleString("ko-KR")}</dd>
                <dt>작업 기록</dt>
                <dd>{item.completed ? "완료 기록" : "미완료 또는 확인 필요"}</dd>
                <dt>보존 기록</dt>
                <dd>
                  {item.preserved ? "보존 완료 기록 · 복구 전 사본 재검사" : "불완전한 보존 기록"}
                </dd>
              </dl>
              <button
                type="button"
                disabled={!item.preserved}
                className={actionClasses("secondary")}
                onClick={() => {
                  void controller.recover(item);
                }}
              >
                복구 위치 선택
              </button>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

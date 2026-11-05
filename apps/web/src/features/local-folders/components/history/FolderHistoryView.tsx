import { useState } from "react";
import { StatusLabel } from "../../../../components/ui/StatusLabel";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { FolderHistory } from "../../services/folder-history";
import type { TargetInspectionState, CopyHistoryInspectionState } from "../../store/folder-history-controller";
import type { RestoreInspectionState } from "../../store/folder-history-controller";
import { HistoryTargetView } from "./HistoryTargetView";
import { CopyHistoryView } from "./CopyHistoryView";
import { RestoreHistoryView } from "./RestoreHistoryView";
import styles from "./folder-history.module.css";

const kinds = {
  folder: "폴더", txt: "TXT 파일", md: "MD 파일"
};

const statuses = {
  ready: "완료 기록", failed: "실패 기록", uncertain: "결과 미확인"
};

export const historyTime = (value: string) => new Date(value).toLocaleString("ko-KR", { hour12: false });
/** 검증된 기록의 표시만 담당한다. 파일 접근이나 복구 동작은 제공하지 않는다. */
export function FolderHistoryView({ result, inspection, onInspect, onCancelInspection, copyInspection, onInspectCopy, onCancelCopy, restoreInspection, onInspectRestore }: {
  result: FolderHistory;
  inspection: TargetInspectionState | null;
  onInspect: (id: string) => void;
  onCancelInspection: () => void;
  copyInspection?: CopyHistoryInspectionState | null;
  onInspectCopy?: (id: string) => void;
  onCancelCopy?: () => void;
  restoreInspection?: RestoreInspectionState | null;
  onInspectRestore?: (id: string) => void;
}) {
  const [category, setCategory] = useState<"copy" | "move" | "create" | "restore">(
    result.copies?.groups.length ? "copy" : result.restores?.groups.length ? "restore" : "create",
  );
  const problems = [result.truncated && "읽기 한도에 도달함", result.invalid && `잘못된 기록 ${result.invalid}개`,
  result.unsupported && `지원하지 않는 형식 ${result.unsupported}개`, result.unreadable && `읽지 못한 기록 ${result.unreadable}개`,
  result.oversized && `크기 초과 ${result.oversized}개`].filter(Boolean).join(" · ");

  return <>
    <div
      className={styles.categories}
      role="group"
      aria-label="작업 기록 종류"
    >
      {([['copy', '복사', result.copies?.groups.length ?? 0], ['move', '이동', 0], ['create', '생성', result.groups.length], ['restore', '복원', result.restores?.groups.length ?? 0]] as const).map(([value, label, count]) => <button
        type="button"
        key={value}
        className={actionClasses(category === value ? "primary" : "ghost")}
        aria-pressed={category === value}
        onClick={() => setCategory(value)}
      >{label} {count}</button>)}
    </div>
    {result.incomplete && <StatusNotice
      state="attention"
      title="일부 기록을 확인하지 못했어요."
      detail={`${problems}. 표시된 작업도 결과 미확인으로 남겨 둡니다.`}
    />}
    {result.excluded > 0 && <p className={styles.note}>다른 사용자 또는 작업 공간의 기록 {result.excluded}개를 제외했어요.</p>}
    {category === "move" && <p className={styles.empty}>이동 작업의 보존본과 완료 기록은 ‘휴지통·보존 기록’에서 확인할 수 있습니다.</p>}
    {category === "copy" && !result.copies?.groups.length && <p className={styles.empty}>이 위치에 표시할 복사 기록이 없어요.</p>}
    {category === "create" && !result.groups.length && <p className={styles.empty}>이 위치에 표시할 생성 기록이 없어요.</p>}
    {category === "create" && result.groups.length > 0 && <ol className={styles.list} aria-label="작업 기록 목록">
      {result.groups.map(group => <li key={group.id}>
        <details className={styles.record}><summary><strong>{group.path?.at(-1) ?? "경로 기록 불일치"}</strong><StatusLabel emphasis={group.status !== "ready"}>{statuses[group.status]}</StatusLabel><time dateTime={group.time}>{historyTime(group.time)}</time></summary>
          <dl><dt>종류</dt><dd>{group.kind ? kinds[group.kind] : "종류 기록 불일치"}</dd>
            <dt>위치</dt><dd>{group.path?.join(" / ") ?? "확인할 수 없음"}</dd>
            <dt>기록 시각</dt><dd><time dateTime={group.time}>{historyTime(group.time)}</time></dd></dl>
          {group.status === "uncertain" && <>
            <p className={styles.note}>현재 상태를 확인해도 과거 작업 결과는 미확인으로 남습니다.</p>
            <HistoryTargetView
              group={group}
              state={inspection?.id === group.id ? inspection : null}
              onInspect={onInspect}
              onCancel={onCancelInspection}
            />
          </>}
          <details><summary>작업 식별 정보</summary><p className={styles.note}>{group.id} · 기록 {group.count}개</p></details>
        </details>
      </li>)}
    </ol>}
    {category === "copy" && result.copies && <CopyHistoryView
      history={result.copies}
      inspection={copyInspection ?? null}
      onInspect={onInspectCopy}
      onCancel={onCancelCopy}
    />}
    {category === "restore" && <RestoreHistoryView inspection={restoreInspection ?? null} onInspect={onInspectRestore} history={result.restores ?? {
      groups: [], missing: true, incomplete: false, excluded: 0,
    }} />}
  </>;
}

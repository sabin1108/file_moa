"use client";

import { useEffect, useRef } from "react";
import { actionClasses } from "../../../../components/ui/action-classes";
import { Icon } from "../../../../components/ui/Icon";
import styles from "./file-selection.module.css";

type Props = {
  selectedCount: number;
  visibleSelectedCount: number;
  fileCount: number;
  selectedFolderCount: number;
  hiddenSelectedCount: number;
  disabled: boolean;
  onSelectAll: () => void;
  onClearVisible: () => void;
  onClear: () => void;
  onExit?: () => void;
  onReviewPlan?: (operation: "copy" | "move") => void;
  onTrash?: () => void;
};

/** 선택 상태는 목록 controller가 소유한다. native checkbox의 혼합 표시만 DOM에 연결한다. */

export function FileSelectionToolbar({
  selectedCount,
  visibleSelectedCount,
  fileCount,
  selectedFolderCount,
  hiddenSelectedCount,
  disabled,
  onSelectAll,
  onClearVisible,
  onClear,
  onExit,
  onReviewPlan,
  onTrash,
}: Props) {
  const all = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (all.current)
      all.current.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < fileCount;
  }, [visibleSelectedCount, fileCount]);

  return (
    <div className={styles.toolbar} role="group" aria-label="파일 선택">
      <label className={styles.selectAll}>
        <input
          ref={all}
          type="checkbox"
          checked={fileCount > 0 && visibleSelectedCount === fileCount}
          disabled={disabled || fileCount === 0}
          onChange={event => (event.target.checked ? onSelectAll() : onClearVisible())}
        />
        표시된 파일 전체 선택
      </label>
      <p role="status" className={styles.count}>
        {selectedCount.toLocaleString("ko-KR")}개 선택
        {hiddenSelectedCount > 0 &&
          ` · 검색 밖 ${hiddenSelectedCount.toLocaleString("ko-KR")}개 포함`}
      </p>
      <button
        type="button"
        className={actionClasses("secondary")}
        disabled={!selectedCount}
        onClick={onClear}
      >
        전체 선택 해제
      </button>
      {(onExit || onReviewPlan || onTrash) && <div className={styles.fileActions}>
        {onExit && <button type="button" className={actionClasses("ghost")} disabled={disabled} onClick={onExit}>선택 모드 끝내기</button>}
        {onReviewPlan && <><button
          type="button"
          className={actionClasses("primary")}
          disabled={disabled || !selectedCount}
          aria-haspopup="dialog"
          onClick={() => onReviewPlan("copy")}
        >
          <Icon name="copy" />
          복사
        </button>
        <button
          type="button"
          className={actionClasses("secondary")}
          disabled={disabled || !selectedCount}
          aria-haspopup="dialog"
          onClick={() => onReviewPlan("move")}
        >
          <Icon name="arrow" className={styles.moveIcon} />
          이동
        </button></>}
        {onTrash
          && (
            <button
              type="button"
              className={actionClasses("secondary")}
              disabled={disabled || !selectedCount}
              aria-haspopup="dialog"
              onClick={onTrash}
            >
              휴지통으로 보내기
            </button>
          )}
      </div>}
      {selectedFolderCount > 0
        && (
          <p className={styles.selectionHint}>
            폴더 {selectedFolderCount}개 포함 · 하위 자료까지 검사하며 이름 충돌과 관리 폴더를
            확인합니다.
          </p>
        )}
      {hiddenSelectedCount > 0 && (
        <p className={styles.selectionHint}>검색 밖 항목을 포함한 전체 선택입니다.</p>
      )}
    </div>
  );
}

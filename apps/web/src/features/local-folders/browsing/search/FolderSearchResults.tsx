import type { FolderSearchState } from "./folder-search-controller";
import type { FolderEntrySelection } from "../../types";
import { actionClasses } from "../../../../components/ui/action-classes";
import { SourceFileRow } from "../file-list/SourceFileRow";
import { SourceFolderRow } from "../file-list/SourceFolderRow";
import styles from "../file-list/source-folder-browser.module.css";

export function FolderSearchResults({ state, rootName, disabled, onOpen, onOpenFile, onSelect, onCancel, onRetry }: {
  state: FolderSearchState;
  rootName: string;
  disabled: boolean;
  onOpen: (path: readonly string[]) => void;
  onOpenFile: (path: readonly string[]) => void;
  onSelect: FolderEntrySelection;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <section aria-label="하위 폴더 포함 검색 결과" aria-busy={state.phase === "loading"}>
      <div className={styles.tools}>
        <p role="status">
          {state.phase === "loading"
            ? "하위 폴더까지 검색 중…"
            : state.phase === "error"
              ? "검색을 마치지 못했어요."
              : state.phase === "cancelled"
                ? "검색을 취소했어요."
                : `${state.result?.entries.length ?? 0}개 검색 결과`}
        </p>
        {state.phase === "loading"
          && (
            <button type="button" className={actionClasses("ghost")} onClick={onCancel}>
              검색 취소
            </button>
          )}
        {(state.phase === "error" || state.phase === "cancelled")
          && (
            <button
              type="button"
              className={actionClasses("secondary")}
              disabled={disabled}
              onClick={onRetry}
            >
              검색 다시 시도
            </button>
          )}
      </div>
      {state.result?.incomplete
        && (
          <p role="status" className={styles.footnote}>
            읽지 못한 폴더가 있거나 검색 한도에 도달해 일부 결과만 표시합니다. 폴더를 좁혀 다시 검색해
            주세요.
          </p>
        )}
      <ul className={styles.entries} aria-label="검색한 파일과 폴더">
        {state.result?.entries.map(entry => {
          const parent = entry.path.slice(0, -1);
          const select = () => onSelect(parent, entry.name, entry.kind);

          return (
            <li key={JSON.stringify([entry.path, entry.kind])}>
              {entry.kind === "directory"
                ? (
                  <SourceFolderRow
                    name={entry.name}
                    selected={false}
                    selecting={false}
                    disabled={disabled}
                    selectionDisabled={disabled}
                    onOpen={() => onOpen(entry.path)}
                    onToggle={select}
                    onLongSelect={select}
                  />
                )
                : (
                  <SourceFileRow
                    name={entry.name}
                    selected={false}
                    selecting={false}
                    previewing={false}
                    selectionDisabled={disabled}
                    previewDisabled={disabled}
                    onPreview={() => onOpenFile(entry.path)}
                    onToggle={select}
                    onLongSelect={select}
                  />
                )}
              <button
                type="button"
                className={styles.searchLocation}
                disabled={disabled}
                onClick={() => onOpen(parent)}
                aria-label={`${entry.name} 위치 열기: ${[rootName, ...parent].join(" / ")}`}
              >
                {[rootName, ...parent].join(" / ")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

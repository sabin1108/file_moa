/**
 * SourceFolderBrowser가 전달한 목록 상태와 콜백으로 탐색 화면을 구성한다.
 * 파일 행과 선택 도구는 SourceFileRow/FileSelectionToolbar로 나누고, 폴더 이동·본문 읽기·선택 처리는 호출자에게 돌려준다.
 */
import { useId, useRef, type ReactNode, type Ref } from "react";
import { Icon } from "../../../../components/ui/Icon";
import { actionClasses } from "../../../../components/ui/action-classes";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import type { SourceListingState, ListingIssue } from "../../store/source-listing-controller";
import styles from "./source-folder-browser.module.css";
import { FileSelectionToolbar } from "./FileSelectionToolbar";
import { SourceFileRow } from "./SourceFileRow";
import { SourceFolderRow } from "./SourceFolderRow";
import { FileNameSearch } from "./FileNameSearch";
import { FolderUpButton } from "./FolderUpButton";
import { filterFolderEntries } from "../../lib/file-name-search";
import type { FolderSearchState } from "../../store/folder-search-controller";
import { FolderSearchResults } from "./FolderSearchResults";
import type { FolderEntrySelection } from "../../types";

const issueTitles: Record<ListingIssue, string> = {
  permission: "폴더를 읽을 권한이 필요해요. 연결 관리에서 다시 연결해 주세요.",
  missing: "요청한 폴더를 찾지 못했어요. 위치가 바뀌었거나 삭제되었을 수 있습니다.",
  read: "목록을 읽지 못했어요. 폴더 상태를 확인한 뒤 다시 시도해 주세요.",
  cancelled: "목록 읽기를 취소했어요.",
};

type Props = {
  state: SourceListingState;
  folderName: string | null;
  headingRef: Ref<HTMLHeadingElement>;
  connectionControls: ReactNode;
  historyControls: ReactNode;
  creation: ReactNode;
  previewName: string | null;
  onSearchOpen: (open: boolean) => void;
  searchState: FolderSearchState;
  onSearchCancel: () => void;
  onSearchRetry: () => void;
  onSelectSearch: FolderEntrySelection;
  onOpen: (path: readonly string[]) => void;
  onOpenFile: (path: readonly string[]) => void;
  onRefresh: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onToggleSelection: (name: string) => void;
  onSelectAll: () => void;
  onClearVisibleSelection: () => void;
  onQueryChange: (query: string) => void;
  onClearSelection: () => void;
  onExitSelection?: () => void;
  onReviewPlan: (operation: "copy" | "move") => void;
  onTrash?: () => void;
};
/** Display values and actions only: no handle, storage, permission or API access. */

export function FolderListingView({
  state, searchState, folderName, headingRef, previewName,
  connectionControls, historyControls, creation,
  onSearchCancel, onSearchRetry, onSelectSearch, onSearchOpen, onQueryChange,
  onOpen, onOpenFile, onRefresh, onRetry, onCancel,
  onToggleSelection, onSelectAll, onClearVisibleSelection, onClearSelection, onExitSelection, onReviewPlan, onTrash,
}: Props) {

  const searchId = useId();
  const selectionId = useId();
  const searchToggle = useRef<HTMLButtonElement>(null);
  const { result, issue } = state;
  const pending = state.phase === "loading";
  const refreshing = pending && result !== null && result.path.length === state.requestedPath.length
    && result.path.every((part, index) => part === state.requestedPath[index]);
  const disabled = !state.available || pending;
  const path = result?.path ?? [];
  const currentName = path.at(-1) ?? folderName ?? "폴더 목록";
  const selected = new Set(state.selectedNames);
  const selectionDisabled = disabled || state.stale || state.phase !== "ready";
  const visibleEntries = filterFolderEntries(result?.entries ?? [], state.query);
  const visibleFiles = visibleEntries.filter(entry => entry.kind === "file");
  const visibleSelectedCount = visibleFiles.filter(entry => selected.has(entry.name)).length;
  const selectedFolderCount = (result?.entries ?? []).filter(entry => entry.kind === "directory" && selected.has(entry.name)).length;
  const hiddenSelectedCount = selected.size - visibleEntries.filter(entry => selected.has(entry.name)).length;
  const longSelect = (name: string) => {
    if (!selected.has(name)) {
      onToggleSelection(name);
    }
  };
  const searching = state.query.trim().length > 0;

  return (
    <section
      className={styles.browser}
      aria-label="자료 폴더 탐색"
      data-listing-phase={state.phase}
    >
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <Icon name="folder" size={24} />
          <h2 ref={headingRef} tabIndex={-1}>
            {currentName}
          </h2>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={actionClasses("ghost", styles.iconButton)}
            aria-label={pending ? "읽기 취소" : "새로고침"}
            title={pending ? "읽기 취소" : "새로고침"}
            disabled={!state.available}
            onClick={pending ? onCancel : onRefresh}
          >
            <Icon name={pending ? "close" : "retry"} />
          </button>
          {connectionControls}
        </div>
      </div>

      <div className={styles.feedback}>
        {pending && !refreshing
          && (
            <StatusNotice
              state="pending"
              title="폴더 목록을 읽고 있어요."
              detail={state.requestedPath.length ? state.requestedPath.join(" / ") : undefined}
            />
          )}
        {issue
          && (
            <StatusNotice
              state={issue === "read" || issue === "missing" ? "error" : "attention"}
              title={issueTitles[issue]}
              detail={
                result
                  ? "아래는 이전에 확인한 목록입니다. 현재 폴더 상태와 다를 수 있어요."
                  : undefined
              }
              action={
                state.available
                && (
                  <button type="button" className={actionClasses("secondary")} onClick={onRetry}>
                    다시 시도
                  </button>
                )
              }
            />
          )}
        {result?.truncated
          && (
            <StatusNotice
              state="attention"
              title="항목이 많아 1,000개까지만 표시했어요."
              detail="전체 목록이 아닙니다. 표시된 하위 폴더로 들어가 범위를 좁혀 주세요."
            />
          )}
      </div>

      {result
        && (
          <div className={styles.tools}>
            <p className={styles.caption} role="status" aria-atomic="true">
              {refreshing ? "갱신 중 · " : state.stale ? "이전 확인 목록 · " : ""}
              {searching
                ? "하위 폴더 포함"
                : `${result.entries.length.toLocaleString("ko-KR")}개 항목`}
              {result.truncated ? " · 일부 표시" : ""}
            </p>
            <button
              ref={searchToggle}
              type="button"
              className={actionClasses("ghost")}
              aria-expanded={state.searchOpen}
              aria-controls={searchId}
              disabled={pending}
              onClick={() => onSearchOpen(!state.searchOpen)}
            >
              <Icon name="search" />
              {state.searchOpen ? "검색 닫기" : "검색"}
            </button>
            {historyControls}
          </div>
        )}
      <div id={searchId} hidden={!state.searchOpen}>
        {result && state.searchOpen
          && (
            <FileNameSearch
              key={JSON.stringify(result.path)}
              query={state.query}
              disabled={pending}
              onQueryChange={onQueryChange}
              onClose={() => {
                onSearchOpen(false);
                searchToggle.current?.focus();
              }}
            />
          )}
      </div>
      <div id={selectionId} hidden={!state.selectionOpen || searching}>
        {result
          && (
            <FileSelectionToolbar
              selectedCount={selected.size}
              visibleSelectedCount={visibleSelectedCount}
              selectedFolderCount={selectedFolderCount}
              hiddenSelectedCount={hiddenSelectedCount}
              fileCount={visibleFiles.length}
              disabled={selectionDisabled}
              onSelectAll={onSelectAll}
              onClearVisible={onClearVisibleSelection}
              onClear={onClearSelection}
              onExit={onExitSelection}
              onReviewPlan={onReviewPlan}
              onTrash={onTrash}
            />
          )}
      </div>
      {searching && selected.size > 0
        && (
          <div className={styles.tools}>
            <p>{selected.size}개 선택 유지</p>
            <button type="button" className={actionClasses("secondary")} onClick={onClearSelection}>
              전체 선택 해제
            </button>
          </div>
        )}
      {creation}
      {!state.selectionOpen && !searching && result
        && (
          <p className={styles.footnote}>
            길게 누르거나 항목에 초점을 두고 Space를 누르면 선택합니다.
          </p>
        )}
      <div aria-busy={pending} className={styles.contents}>
        {path.length > 0
          && (
            <FolderUpButton
              parentName={path.at(-2) ?? folderName ?? "연결 폴더"}
              disabled={disabled}
              onClick={() => onOpen(path.slice(0, -1))}
            />
          )}
        {!result && !pending && !issue
          && (
            <p className={styles.empty}>
              {state.available
                ? "새로고침을 눌러 폴더 목록을 확인하세요."
                : "폴더 연결 관리에서 자료 폴더를 연결하면 안의 파일과 하위 폴더를 볼 수 있어요."}
            </p>
          )}
        {searching
          && (
            <FolderSearchResults
              state={searchState}
              rootName={folderName ?? "연결 폴더"}
              disabled={selectionDisabled}
              onOpen={onOpen}
              onOpenFile={onOpenFile}
              onSelect={onSelectSearch}
              onCancel={onSearchCancel}
              onRetry={onSearchRetry}
            />
          )}
        {!searching && result?.entries.length === 0
          && (
            <p className={styles.empty}>
              {state.stale
                ? "이전 조회에서는 항목이 없었어요."
                : "이 폴더에는 파일이나 하위 폴더가 없어요."}
            </p>
          )}
        {!searching && visibleEntries.length > 0
          && (
            <ul className={styles.entries} aria-label="파일과 하위 폴더">
              {visibleEntries.map(entry => (
                <li key={JSON.stringify([path, entry.name, entry.kind])}>
                  {entry.kind === "directory"
                    ? (
                      <SourceFolderRow
                        name={entry.name}
                        selected={selected.has(entry.name)}
                        selecting={state.selectionOpen}
                        disabled={disabled}
                        selectionDisabled={selectionDisabled}
                        onOpen={() => onOpen([...path, entry.name])}
                        onToggle={() => onToggleSelection(entry.name)}
                        onLongSelect={() => longSelect(entry.name)}
                      />
                    )
                    : (
                      <SourceFileRow
                        name={entry.name}
                        selected={selected.has(entry.name)}
                        previewing={entry.name === previewName}
                        selecting={state.selectionOpen}
                        selectionDisabled={selectionDisabled}
                        previewDisabled={disabled}
                        onToggle={() => onToggleSelection(entry.name)}
                        onPreview={() => onOpenFile([...path, entry.name])}
                        onLongSelect={() => longSelect(entry.name)}
                      />
                    )}
                </li>
              ))}
            </ul>
          )}
      </div>
      {state.selectionOpen
        && (
          <p className={styles.footnote}>
            복사·이동·휴지통 작업은 범위 검사와 최종 확인 후 실행합니다.
          </p>
        )}
    </section>
  );
}

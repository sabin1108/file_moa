import { WorkspaceSidebar, WorkspaceNavigation } from "../../../../components/layout/WorkspaceSidebar";
import type { ReactNode } from "react";
import { Icon } from "../../../../components/ui/Icon";
import type { FolderListing } from "../../services/source-folder-listing";
import styles from "./folder-workspace.module.css";
import { PreviousFolderEntry } from "./PreviousFolderEntry";
import type { FolderEntrySelection } from "../../types";
/** 경로/방문한 상위 열/목록/본문의 배치만 담당한다. 시안의 예시 데이터는 넣지 않는다. */
export function FolderWorkspaceFrame({
  rootName,
  path,
  ancestors,
  disabled,
  onOpen,
  onOpenFile,
  onSelectPrevious,
  children,
  preview,
  footer,
  mode = "live",
  folderTree,
  quickMenu = true,
}: {
  mode?: "live" | "sample";
  rootName: string;
  path: readonly string[];
  ancestors: readonly FolderListing[];
  disabled: boolean;
  onOpen: (path: readonly string[]) => void;
  children: ReactNode;
  preview: ReactNode;
  footer: ReactNode;
  onOpenFile: (path: readonly string[]) => void;
  onSelectPrevious: FolderEntrySelection;
  folderTree?: ReactNode;
  quickMenu?: boolean;
}) {
  const parent = ancestors.at(-1);

  return (
    <div
      className={styles.workspace}
      data-workspace={mode}
      data-workspace-quick-menu={quickMenu || undefined}
    >
      <WorkspaceSidebar active="files" mode={mode}>
        {folderTree}
      </WorkspaceSidebar>
      <header className={styles.header}>
        <div className={styles.history}>
          <button type="button" aria-label="이전 방문으로" onClick={() => window.history.back()}>
            ‹
          </button>
          <button type="button" aria-label="다음 방문으로" onClick={() => window.history.forward()}>
            ›
          </button>
        </div>
        <nav className={styles.breadcrumb} aria-label="현재 폴더 위치">
          <ol>
            {[rootName, ...path].map((name, index) => (
              <li key={index}>
                {index > 0 && <Icon name="chevron" size={14} />}
                {index === path.length ? (
                  <span aria-current="location">{name}</span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onOpen(path.slice(0, index))}
                  >
                    {name}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </header>
      <div className={styles.workarea}>
        <main className={styles.columns} data-has-parent={!!parent}>
          <h1 className={styles.srOnly}>내 파일</h1>
          {parent && (
            <aside className={styles.parent} aria-label="상위 폴더에서 확인한 항목">
              <div className={styles.parentTitle}>
                <span>{parent.path.at(-1) ?? rootName}</span>
                <small>이전 확인 목록</small>
              </div>
              <ul>
                {parent.entries.map(entry => {
                  const current =
                    entry.kind === "directory" && entry.name === path[parent.path.length];

                  return (
                    <PreviousFolderEntry
                      key={JSON.stringify([entry.name, entry.kind])}
                      {...entry}
                      current={current}
                      disabled={disabled}
                      onOpen={() =>
                        entry.kind === "file"
                          ? onOpenFile([...parent.path, entry.name])
                          : onOpen(current ? parent.path : [...parent.path, entry.name])
                      }
                      onSelect={() => onSelectPrevious(parent.path, entry.name, entry.kind)}
                    />
                  );
                })}
              </ul>
              {parent.truncated && <p>일부 항목만 확인했습니다.</p>}
            </aside>
          )}
          <div className={styles.current}>{children}</div>
          {preview}
        </main>
      </div>
      <footer className={styles.footer}>
        {footer}
        <nav aria-label="모바일 작업 공간">
          <WorkspaceNavigation active="files" mode={mode} />
        </nav>
      </footer>
    </div>
  );
}

/**
 * 실제 대화·파일·설정·로그인 안내 경로가 공유하는 작업 화면 프레임이다.
 * 페이지가 제목/활성 메뉴/본문을 전달하면 공통 메뉴와 읽기 영역을 배치한다. 폴더 기능이나 합성 시안 상태는 소유하지 않는다.
 */
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { ActionLink } from "../ui/ActionLink";
import { WorkspaceSidebar, WorkspaceNavigation, type WorkspaceSection } from "./WorkspaceSidebar";
import ui from "../../styles/workspace-ui.module.css";
import styles from "../../styles/workspace-layout.module.css";

/** 가짜 이력이나 프로필을 만들지 않고 실제 작업 경로를 안내한다. */

export function WorkspaceShell({ title, active, children, mode = "live", tools, folderTree, quickMenu = true }: {
  title: string;
  active?: WorkspaceSection;
  children: ReactNode;
  mode?: "live" | "sample";
  tools?: ReactNode;
  folderTree?: ReactNode;
  quickMenu?: boolean;
}) {
  return (
    <div
      className={`${ui.system} ${ui.workspace}`}
      data-workspace={mode}
      data-workspace-quick-menu={quickMenu || undefined}
    >
      <a className="skip-link" href="#workspace-content">본문으로 건너뛰기</a>
      <WorkspaceSidebar active={active} mode={mode}>
        {folderTree}
      </WorkspaceSidebar>
      <main id="workspace-content" className={`${ui.main} ${styles.main}`}>
        <header className={ui.topbar}>
          <h1>
            {title}
          </h1>
          <nav aria-label={mode === "sample" ? "샘플 작업 메뉴" : "계정 메뉴"}>
            {tools ?? (mode === "sample"
              ? <ActionLink href="/login">정식으로 사용</ActionLink>
              : <>
                <ActionLink href="/account">
                  <Icon name="person" />
                  계정
                </ActionLink>
              </>)}
          </nav>
        </header>
        <nav className={styles.mobileNav} aria-label="모바일 주 메뉴">
          <WorkspaceNavigation active={active} mode={mode} />
        </nav>
        {children}
      </main>
    </div>
  );
}

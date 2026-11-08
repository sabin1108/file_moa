import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, MoaMark } from "../ui/Icon";
import { NavigationProgress } from "../ui/feedback/NavigationProgress";
import styles from "../../styles/sidebar.module.css";

import { workspaceHref, type WorkspaceMode, type WorkspaceSection } from "../../shared/workspace-navigation";
export type { WorkspaceMode, WorkspaceSection } from "../../shared/workspace-navigation";
const destinations = [{ id: "files", label: "폴더", icon: "folder" }, { id: "chat", label: "채팅", icon: "chat" }, { id: "settings", label: "설정", icon: "settings" }] as const;

export function WorkspaceNavigation({ active, mode = "live", primaryOnly = false }: { active?: WorkspaceSection; mode?: WorkspaceMode; primaryOnly?: boolean }) {
  return destinations
    .filter(item => !primaryOnly || item.id !== "settings")
    .map(item => (
      <Link
        key={item.id}
        href={workspaceHref(mode, item.id)}
        aria-current={active === item.id ? "page" : undefined}
        className={active === item.id ? styles.activeNav : undefined}
      >
        <Icon name={item.icon} size={18} />
        <span>{item.label}</span>
        <NavigationProgress />
      </Link>
    ));
}

/** 공통 탐색은 표시와 이동만 소유하며 실제 폴더 핸들/계정 저장소는 받지 않는다. */
export function WorkspaceSidebar({ active, mode = "live", children }: { active?: WorkspaceSection; mode?: WorkspaceMode; children?: ReactNode }) {
  return (
    <aside className={styles.sidebar} aria-label="작업 공간 메뉴" data-workspace-sidebar>
      <Link href={workspaceHref(mode, "chat")} className={styles.brand} aria-label="모아 채팅">
        <MoaMark size={30} />
        <span>
          모아<span className={styles.brandDot}>.</span>
        </span>
        <NavigationProgress />
      </Link>
      <nav className={styles.navigation} aria-label="주 메뉴">
        <WorkspaceNavigation active={active} mode={mode} primaryOnly />
      </nav>
      <div className={styles.folderTree}>{children}</div>
      <div className={styles.sidebarFooter}>
        <Link
          href={workspaceHref(mode, "settings")}
          className={styles.accountEntry}
          aria-current={active === "settings" ? "page" : undefined}
        >
          <Icon name="settings" />
          설정
          <NavigationProgress />
        </Link>
        {mode === "sample" ? (
          <span className={styles.accountEntry}>
            <Icon name="person" />
            <span>샘플 체험 중</span>
          </span>
        ) : (
          <Link href="/account" className={styles.accountEntry}>
            <Icon name="person" />
            나의 계정
            <NavigationProgress />
          </Link>
        )}
      </div>
    </aside>
  );
}

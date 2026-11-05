/**
 * 실제 대화·파일·설정·로그인 안내 경로가 공유하는 작업 화면 프레임이다.
 * 페이지가 제목/활성 메뉴/본문을 전달하면 공통 메뉴와 읽기 영역을 배치한다. 폴더 기능이나 합성 시안 상태는 소유하지 않는다.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, MoaMark } from "../ui/Icon";
import { ActionLink } from "../ui/ActionLink";
import sidebar from "../../styles/sidebar.module.css";
import ui from "../../styles/workspace-ui.module.css";
import styles from "../../styles/workspace-layout.module.css";

type Section = "chat" | "files" | "settings";

const navigation = [
  { id: "chat", href: "/", label: "대화", icon: "chat" },
  { id: "files", href: "/files", label: "내 폴더", icon: "folder" },
  { id: "settings", href: "/settings", label: "설정", icon: "settings" },
] as const;

function Navigation({ active }: { active?: Section }) {
  return navigation.map(item => (
    <Link
      key={item.id}
      href={item.href}
      aria-current={active === item.id ? "page" : undefined}
      className={active === item.id ? sidebar.activeNav : undefined}
    >
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
    </Link>
  ));
}

/** 가짜 이력이나 프로필을 만들지 않고 실제 작업 경로를 안내한다. */
export function WorkspaceShell({ title, active, children }: {
  title: string;
  active?: Section;
  children: ReactNode;
}) {
  return (
    <div className={`${ui.system} ${ui.workspace}`} data-workspace="live">
      <a className="skip-link" href="#workspace-content">본문으로 건너뛰기</a>
      <aside className={sidebar.sidebar} aria-label="작업 공간 메뉴">
        <Link href="/" className={sidebar.brand} aria-label="모아 대화">
          <MoaMark size={32} />
          <span>모아<span className={sidebar.brandDot}>.</span></span>
        </Link>
        <nav className={sidebar.navigation} aria-label="주 메뉴">
          <Navigation active={active} />
        </nav>
        <div className={styles.sidebarNote}>실제 로그인은 아직 연결되지 않았습니다.</div>
      </aside>
      <main id="workspace-content" className={`${ui.main} ${styles.main}`}>
        <header className={ui.topbar}>
          <h1>{title}</h1>
          <ActionLink href="/preview">시안 보관함</ActionLink>
        </header>
        <nav className={styles.mobileNav} aria-label="모바일 주 메뉴">
          <Navigation active={active} />
        </nav>
        {children}
      </main>
    </div>
  );
}

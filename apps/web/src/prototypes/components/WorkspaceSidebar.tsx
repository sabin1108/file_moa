import Link from "next/link";
import { PrototypeDialog } from "../demo/PrototypeDialog";
import { recentConversations } from "../prototype-data";
import { Icon, MoaMark } from "../../components/ui/Icon";
import { PreviewButton } from "./PreviewButton";
import styles from "../../styles/sidebar.module.css";

export function WorkspaceSidebar({ active = "chat", showHistory = true }: { active?: "chat" | "files" | "settings"; showHistory?: boolean }) {
  return (
    <aside className={styles.sidebar} aria-label="작업 공간 메뉴">
      <Link href="/preview/screens/chat" className={styles.brand} aria-label="모아 채팅 시안">
        <MoaMark size={32} /><span>모아<span className={styles.brandDot}>.</span></span>
      </Link>
      <PreviewButton className={styles.newChat}><Icon name="plus" size={17} /><span>새 대화</span></PreviewButton>
      <nav className={styles.navigation} aria-label="주 메뉴">
        <Link href="/preview/screens/chat" className={active === "chat" ? styles.activeNav : undefined}
          aria-current={active === "chat" ? "page" : undefined}><Icon name="chat" /><span>대화</span></Link>
        <Link href="/preview/screens/files" className={active === "files" ? styles.activeNav : undefined}
          aria-current={active === "files" ? "page" : undefined}><Icon name="folder" /><span>내 폴더</span></Link>
      </nav>
      {active === "chat" && showHistory && (
        <section className={styles.simpleHistory} aria-labelledby="recent-title">
          <div className={styles.sectionHeading}>
            <h2 id="recent-title">최근 대화</h2>
            <PrototypeDialog initial="search" label="대화 검색"><Icon name="search" size={16} /></PrototypeDialog>
          </div>
          {recentConversations.slice(0, 3).map(chat => (
            <PreviewButton key={chat.title} className={chat.active ? styles.selectedChat : styles.chatRow}>
              <span>{chat.title}</span>
            </PreviewButton>
          ))}
        </section>
      )}
      <footer className={styles.sidebarFooter}>
        <span className={styles.avatar}>S</span><div><strong>나의 공간</strong></div>
        <Link href="/preview/screens/settings" aria-label="설정 시안" aria-current={active === "settings" ? "page" : undefined}><Icon name="settings" size={18} /></Link>
      </footer>
    </aside>
  );
}

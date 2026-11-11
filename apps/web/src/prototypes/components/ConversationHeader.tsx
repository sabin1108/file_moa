import { Icon } from "../../components/ui/Icon";
import { PreviewButton } from "./PreviewButton";
import { ActionLink } from "../../components/ui/ActionLink";
import styles from "../styles/conversation.module.css";

export function ConversationHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headingGroup}>
        <PreviewButton label="메뉴" className={styles.mobileMenu}>
          <Icon name="menu" />
        </PreviewButton>
        <h1>리액트 렌더링, 다시 이해하기</h1>
      </div>
      <div className={styles.headerActions}>
        <ActionLink href="/files">
          <Icon name="folder" size={17} />
          내 폴더
        </ActionLink>
        <PreviewButton label="참고 자료">
          <Icon name="panel" size={18} />
        </PreviewButton>
      </div>
    </header>
  );
}

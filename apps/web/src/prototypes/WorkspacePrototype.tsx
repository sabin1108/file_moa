import { ConversationHeader } from "./components/ConversationHeader";
import { ConversationThread } from "./components/ConversationThread";
import { MessageComposer } from "./components/MessageComposer";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";
import styles from "./styles/workspace.module.css";

// 자료 미리보기는 기본 화면에서 닫고, 대화 읽기에 집중하는 시안입니다.
export function WorkspacePrototype() {
  return <div className={styles.workspace}><a className="skip-link" href="#conversation">대화 내용으로 건너뛰기</a><WorkspaceSidebar /><main id="conversation" className={styles.conversation + " reading-surface"}><ConversationHeader /><ConversationThread /><MessageComposer /></main></div>;
}

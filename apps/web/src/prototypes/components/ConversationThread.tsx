import { PrototypeDialog } from "../demo/PrototypeDialog";
import { ChatMessage } from "./ChatMessage";
import { Icon } from "../../components/ui/Icon";
import { PreviewButton } from "./PreviewButton";
import styles from "../styles/conversation.module.css";

export function ConversationThread() {
  return (
    <div className={styles.thread} role="region" tabIndex={0} aria-label="예시 대화">
      <div className={styles.threadInner}>
        <div className={styles.dayDivider}>10월 24일</div>
        <ChatMessage author="user" time="오후 2:32">
          <p>리액트 공부한 내용이 좀 헷갈려.<br />리렌더링 줄이려면 뭐부터 보면 좋을까?</p>
        </ChatMessage>
        <ChatMessage author="assistant">
          <p>어느 부분이 다시 그려지는지부터 같이 보면 좋겠어요. 지금 느리게 느껴지는 화면이 있어요?</p>
        </ChatMessage>
        <ChatMessage author="user" time="오후 2:33">
          <p>검색창에 글자를 칠 때마다<br />아래 파일 목록도 같이 움직이는 것 같아.</p>
        </ChatMessage>
        <ChatMessage author="assistant">
          <p>그럼 검색어 상태가 목록과 같은 부모에 있는지 먼저 봐요. 입력할 때 부모가 바뀌면서 목록도 다시 그려질 수 있거든요.</p>
          <p>공부 노트에도 비슷한 내용이 있어요. <strong>검색창 상태를 가까이 두고</strong>, 목록이 실제로 느린지는 Profiler로 확인해 보면 돼요.</p>
          <PrototypeDialog initial="document" documentName="렌더링과 상태 관리.md" className={styles.sourceLink}><Icon name="file" size={14} />렌더링과 상태 관리.md<Icon name="chevron" size={12} /></PrototypeDialog>
          <p>검색창과 목록이 있는 코드를 보여줄래요?</p>
          <div className={styles.responseActions}>
            <PreviewButton label="답변 복사"><Icon name="copy" size={15} /></PreviewButton>
            <PreviewButton label="다시 답변"><Icon name="retry" size={15} /></PreviewButton>
          </div>
        </ChatMessage>
      </div>
    </div>
  );
}

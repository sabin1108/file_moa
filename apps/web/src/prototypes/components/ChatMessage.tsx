import type { ReactNode } from "react";
import { MoaMark } from "../../components/ui/Icon";
import styles from "../styles/conversation.module.css";

export function ChatMessage({ author, children, time }: {
  author: "user" | "assistant"; children: ReactNode; time?: string;
}) {
  const own = author === "user";
  return (
    <article className={own ? styles.userMessage : styles.assistantMessage} aria-label={own ? "나의 메시지" : "모아의 답변"}>
      {!own && <div className={styles.assistantIdentity}><MoaMark size={22} /><span>모아</span></div>}
      <div className={own ? styles.userBubble : styles.answerBody}>{children}</div>
      {time && <span className={styles.messageTime}>{time}</span>}
    </article>
  );
}

import type { ReactNode } from "react";
import { StatusNotice } from "../../components/ui/feedback/StatusNotice";
import styles from "./prototype-feedback.module.css";

export type AnswerPhase = "queued" | "reading" | "writing" | "stopped" | "error" | "complete";
const phases = {
  queued: { title: "요청을 받았어요", detail: "답변을 시작할 준비를 하고 있어요.", tone: "pending" },
  reading: { title: "선택한 자료를 확인하고 있어요", detail: "답변에 필요한 내용을 찾고 있어요.", tone: "pending" },
  writing: { title: "답변을 작성하고 있어요", detail: "도착한 내용부터 읽을 수 있어요.", tone: "pending" },
  stopped: { title: "답변 작성을 멈췄어요", detail: "지금까지 작성된 내용은 아래에 남아 있어요.", tone: "attention" },
  error: { title: "답변을 끝까지 받지 못했어요", detail: "받은 내용은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.", tone: "error" },
  complete: { title: "답변을 마쳤어요", detail: "참고 자료와 함께 확인해 보세요.", tone: "success" },
} as const;

export function AnswerStatus({ phase, text, sources = [], action }: {
  phase: AnswerPhase; text: string; sources?: readonly string[]; action?: ReactNode;
}) {
  const state = phases[phase];
  return (
    <section className={styles.answer} aria-label="AI 답변">
      <StatusNotice
        state={state.tone}
        title={state.title}
        detail={
          !text && (phase === "stopped" || phase === "error")
            ? "아직 받은 답변이 없어요. 다시 요청할 수 있어요."
            : state.detail
        }
        action={action}
      />
      <article
        className={styles.answerText}
        aria-label="답변 내용"
        aria-live="off"
        data-writing={phase === "writing" || undefined}
      >
        {text ? (
          <p>{text}</p>
        ) : (
          <p className={styles.emptyAnswer}>답변이 도착하면 이곳에 표시됩니다.</p>
        )}
      </article>
      {!!sources.length && (
        <ul className={styles.sources} aria-label="참고 자료">
          {sources.map(source => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

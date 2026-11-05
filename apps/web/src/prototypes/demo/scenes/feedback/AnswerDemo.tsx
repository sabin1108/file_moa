"use client";
import { useState } from "react";
import { AnswerStatus, type AnswerPhase } from "../../../feedback/AnswerStatus";
import { DemoButton } from "../../DemoButton";
import { ScenarioControls } from "./ScenarioControls";
import styles from "./feedback-scenes.module.css";

const partial = "먼저 입력창과 목록이 함께 다시 그려지는지 확인해 보세요.\n\n검색창의 상태를 입력창 가까이에 두면 관련 없는 영역의 갱신을 줄일 수 있어요.";
const complete = partial + "\n\n그다음 Profiler로 실제 렌더링 비용을 측정하고, 비용이 큰 부분부터 개선하면 됩니다.";
const options = [{ value: "queued", label: "요청 접수" }, { value: "reading", label: "자료 확인" }, { value: "writing", label: "답변 작성" }, { value: "stopped", label: "중지" }, { value: "error", label: "연결 실패" }, { value: "complete", label: "완료" }] as const;

export function AnswerDemo() {
  const [phase, setPhase] = useState<AnswerPhase>("writing");
  const [text, setText] = useState(partial);
  const change = (next: AnswerPhase) => {
    if (next === "queued" || next === "reading") setText("");
    if (next === "writing") setText(partial);
    if (next === "complete") setText(complete);
    setPhase(next);
  };
  const active = phase === "queued" || phase === "reading" || phase === "writing";
  return <div className={styles.stack}>
    <div className={styles.question}><span>나의 질문</span><p>리액트 화면이 느릴 때 어디부터 확인하면 좋을까?</p></div>
    <AnswerStatus phase={phase} text={text} sources={text ? ["리액트 성능 향상.md"] : []} action={active ? <DemoButton onClick={() => setPhase("stopped")}>답변 중지</DemoButton> : phase !== "complete" ? <DemoButton onClick={() => setPhase("writing")}>이어서 작성 예시</DemoButton> : undefined} />
    <ScenarioControls value={phase} options={options} onChange={change} />
  </div>;
}

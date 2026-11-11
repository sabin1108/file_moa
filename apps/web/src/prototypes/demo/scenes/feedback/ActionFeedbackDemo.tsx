"use client";

import { useState } from "react";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { DemoButton } from "../../DemoButton";
import { ScenarioControls } from "./ScenarioControls";
import styles from "./feedback-scenes.module.css";

type Phase = "idle" | "pending" | "success" | "error";

const options = [{ value: "idle", label: "편집" }, { value: "pending", label: "저장 중" }, { value: "success", label: "성공" }, { value: "error", label: "실패" }] as const;

export function ActionFeedbackDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("나의 공부 공간");
  const [submitted, setSubmitted] = useState(name);
  const change = (next: Phase) => {
    if (next === "pending" || next === "success") setSubmitted(name);

    setPhase(next);
  };

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <div>
          <h3>작업 공간 이름</h3>
          <p>목록에서 알아보기 쉬운 이름을 사용해요.</p>
        </div>
      </div>
      <label className={styles.field}>
        표시 이름
        <input
          value={name}
          disabled={phase === "pending"}
          onChange={event => {
            setName(event.target.value);
            setPhase("idle");
          }}
        />
      </label>
      <div className={styles.right}>
        <DemoButton
          variant="primary"
          disabled={phase === "pending" || !name.trim()}
          onClick={() => change("pending")}
        >
          {phase === "pending" ? "저장 중…" : "이름 저장"}
        </DemoButton>
      </div>
      <div className={styles.feedbackArea}>
        {phase === "idle"
          ? (
            <p className={styles.helper}>변경 결과는 이곳에서 확인할 수 있어요.</p>
          )
          : (
            <StatusNotice
              state={phase}
              title={
                phase === "pending"
                  ? "변경사항을 저장하고 있어요"
                  : phase === "success"
                    ? `“${submitted}” 이름을 반영했어요`
                    : "변경사항을 저장하지 못했어요"
              }
              detail={
                phase === "error"
                  ? "입력한 이름은 그대로 남아 있어요. 다시 시도해 주세요."
                  : phase === "success"
                    ? "현재 시안에만 반영되며 서버에는 저장되지 않습니다."
                    : "완료되면 이곳에서 결과를 알려드릴게요."
              }
              action={
                phase === "error"
                  ? (
                    <DemoButton onClick={() => change("pending")}>다시 저장</DemoButton>
                  )
                  : undefined
              }
            />
          )}
      </div>
      <ScenarioControls value={phase} options={options} onChange={change} />
    </div>
  );
}

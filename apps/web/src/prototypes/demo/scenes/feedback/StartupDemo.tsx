"use client";
import { useState } from "react";
import { StartupState } from "../../../feedback/StartupState";
import { ActionLink } from "../../../../components/ui/ActionLink";
import { DemoButton } from "../../DemoButton";
import { ScenarioControls } from "./ScenarioControls";
import styles from "./feedback-scenes.module.css";

const states = {
  loading: { title: "내 작업 공간을 불러오고 있어요", detail: "대화와 자료를 이어갈 준비를 합니다." },
  slow: { title: "연결에 시간이 조금 걸리고 있어요", detail: "아직 작업 공간을 불러오고 있어요. 연결 상태를 확인하거나 다시 시도할 수 있어요." },
  error: { title: "작업 공간을 불러오지 못했어요", detail: "연결 상태를 확인한 뒤 다시 시도해 주세요. 자료가 삭제된 것은 아니에요." },
  ready: { title: "이어서 시작할 준비가 되었어요", detail: "지난 대화와 자료를 살펴보세요." },
};
const options = [{ value: "loading", label: "접속 중" }, { value: "slow", label: "지연" }, { value: "error", label: "실패" }, { value: "ready", label: "준비 완료" }] as const;

export function StartupDemo() {
  const [state, setState] = useState<keyof typeof states>("loading");
  return (
    <div className={styles.stack}>
      <StartupState
        state={state}
        {...states[state]}
        action={
          state === "ready" ? (
            <ActionLink href="/" variant="primary">
              대화로 들어가기
            </ActionLink>
          ) : state !== "loading" ? (
            <DemoButton onClick={() => setState("loading")}>다시 연결</DemoButton>
          ) : undefined
        }
      />
      <ScenarioControls value={state} options={options} onChange={setState} />
    </div>
  );
}

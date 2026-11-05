"use client";
import { useState } from "react";
import { StatusNotice } from "../../../../components/ui/feedback/StatusNotice";
import { DemoButton } from "../../DemoButton";
import { ScenarioControls } from "./ScenarioControls";
import styles from "./feedback-scenes.module.css";

const states = {
  expired: { title: "다시 로그인해야 전송할 수 있어요", detail: "작성 중인 내용은 현재 화면에 남아 있어요. 로그인 후 전송을 이어갈 수 있어요.", tone: "attention" },
  offline: { title: "연결이 끊겨 전송을 기다리고 있어요", detail: "내용을 계속 작성할 수 있어요. 연결을 확인한 뒤 전송해 주세요.", tone: "attention" },
  leaving: { title: "아직 보내지 않은 내용이 있어요", detail: "새로고침하거나 창을 닫으면 현재 초안이 사라질 수 있어요. 작성 중인 내용을 먼저 확인해 주세요.", tone: "attention" },
  ready: { title: "다시 이어갈 수 있어요", detail: "작성 중이던 내용을 확인한 뒤 전송해 주세요.", tone: "success" },
} as const;
const options = [{ value: "expired", label: "세션 만료" }, { value: "offline", label: "연결 끊김" }, { value: "leaving", label: "화면 이탈" }, { value: "ready", label: "복구 완료" }] as const;

export function SessionRecoveryDemo() {
  const [phase, setPhase] = useState<keyof typeof states>("expired");
  const [draft, setDraft] = useState("지금까지 정리한 내용을 바탕으로 다음 공부 계획을 세워줘.");
  const state = states[phase];
  return <div className={styles.stack}>
    <StatusNotice state={state.tone} title={state.title} detail={state.detail} action={phase !== "ready" ? <DemoButton onClick={() => setPhase("ready")}>{phase === "leaving" ? "계속 작성" : phase === "expired" ? "재로그인 완료 예시" : "연결 복구 예시"}</DemoButton> : undefined} />
    <label className={styles.field}>작성 중인 메시지<textarea rows={5} value={draft} onChange={event => setDraft(event.target.value)} /></label>
    <div className={styles.toolbar}><p className={styles.helper}>초안은 이 시안을 여는 동안만 유지됩니다.</p><DemoButton variant="primary" disabled={phase !== "ready" || !draft.trim()} onClick={() => setPhase("offline")}>전송 실패 예시</DemoButton></div>
    <ScenarioControls value={phase} options={options} onChange={setPhase} />
  </div>;
}

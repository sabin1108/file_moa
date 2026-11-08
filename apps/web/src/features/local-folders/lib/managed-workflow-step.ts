/** 현재 작업 상태로 표시와 URL에 같은 단계를 공급한다. URL 자체는 실행 승인이 아니다. */
export function managedWorkflowStep(state: { phase: string; result: { phase: string } | null }) {
  if (state.phase === "running") return !state.result || state.result.phase === "preserving" ? "preserve" : "execute";
  return state.result ? "result" : state.phase === "ready" ? "review" : "destination";
}

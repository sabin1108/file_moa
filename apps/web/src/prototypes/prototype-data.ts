// 디자인 검토를 위한 합성 예시입니다. 사용자 파일이나 실제 대화가 아닙니다.
export const recentConversations = [
  { title: "리액트 렌더링, 다시 이해하기", active: true },
  { title: "프로젝트 경험을 글로 정리하기", active: false },
  { title: "나에게 맞는 공부 루틴", active: false },
];
export const previousConversations = ["포트폴리오의 첫 문장", "자바스크립트 비동기 흐름"];
export const responseSteps = [
  {
    title: "측정하고, 필요한 부분부터",
    text: "Profiler로 자주 렌더링되는 컴포넌트를 살펴보세요. 느린 구간을 찾으면 무엇을 고칠지도 분명해져요.",
    source: 1
  },
  {
    title: "상태는 사용하는 곳 가까이에",
    text: "입력창이 바뀔 때 전체 화면까지 다시 그릴 필요는 없어요. 상태를 필요한 컴포넌트 가까이에 두세요.",
    source: 2
  },
  { title: "메모이제이션은 필요할 때", text: "memo와 useMemo는 측정으로 확인한, 비용이 큰 부분에 선택적으로 적용해 보세요.", source: 1 },
];

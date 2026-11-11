// 파일 관리 디자인 검토용 합성 자료. 실제 디스크를 읽지 않습니다.
export const libraryFiles = [
  {
    name: "리액트 성능 향상.md",
    topic: "React · 성능",
    modified: "2026-10-23",
    size: 2.4,
    referenced: true,
    selected: true
  },
  {
    name: "렌더링과 상태 관리.md",
    topic: "React · 상태 관리",
    modified: "2026-10-23",
    size: 1.8,
    referenced: true,
    selected: false
  },
  {
    name: "React 메모이제이션.md",
    topic: "React · 최적화",
    modified: "2026-10-22",
    size: 3.2,
    referenced: false,
    selected: false
  },
  {
    name: "컴포넌트 설계 원칙.md",
    topic: "설계 · 유지보수",
    modified: "2026-10-21",
    size: 2.6,
    referenced: false,
    selected: false
  },
  {
    name: "웹 성능 체크리스트.txt",
    topic: "웹 · 성능",
    modified: "2026-10-20",
    size: 1.5,
    referenced: false,
    selected: false
  },
  {
    name: "비동기 처리 노트.md",
    topic: "JavaScript · 비동기",
    modified: "2026-10-19",
    size: 4.1,
    referenced: false,
    selected: false
  },
  {
    name: "접근성 점검 노트.md",
    topic: "웹 · 접근성",
    modified: "2026-10-18",
    size: 2.1,
    referenced: false,
    selected: false
  },
  {
    name: "TypeScript 타입 가이드.md",
    topic: "TypeScript · 기본",
    modified: "2026-10-17",
    size: 5.3,
    referenced: false,
    selected: false
  },
] as const;
export const portfolioNames = ["프로젝트 소개.md", "문제 해결 기록.md", "역할과 기여.md", "회고.md", "자기소개 초안.txt"] as const;

// 시안의 다중 선택 상태. 참고 자료 선택과 파일 작업 선택은 별개입니다.
export const selectedFiles = libraryFiles.slice(0, 3);

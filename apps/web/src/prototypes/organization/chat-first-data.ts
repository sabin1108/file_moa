export const exampleDocuments = [
  {
    name: "날짜보고.md",
    excerpt:
      "작성일: 2026-10-01\n검토 기준일: 2026-10-15\n사이트 성능 실측 LCP 2.8초, CLS 0.01입니다."
  },
  {
    name: "혼합자료.txt",
    excerpt: "회사 웹사이트 성능 실측 결과와 개인 영어 학습 노트가 하나의 문서에 섞여 있습니다."
  }
] as const;

export const dateChoices = [
  { value: "2026-10-01", label: "작성일", text: "10월 1일" },
  { value: "2026-10-15", label: "검토 기준일", text: "10월 15일" }
] as const;

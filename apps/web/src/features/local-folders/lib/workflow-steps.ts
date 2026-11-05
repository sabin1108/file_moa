import type { WorkflowStep } from "../../../components/ui/WorkflowStepper";

export const managedSteps: readonly WorkflowStep[] = [
  { id: "destination", label: "목적지·계획" }, { id: "review", label: "계획·검사" },
  { id: "preserve", label: "원본 보존" }, { id: "execute", label: "실행·검증" }, { id: "result", label: "결과" },
];
export const copySteps: readonly WorkflowStep[] = [
  { id: "destination", label: "목적지·계획" }, { id: "inspect", label: "파일 검사" },
  { id: "preserve", label: "기존 파일 보존" }, { id: "overwrite", label: "덮어쓰기 확인" },
  { id: "execute", label: "실행·검증" }, { id: "result", label: "결과" },
];
export const validWorkflowSteps = new Set([...managedSteps, ...copySteps].map(step => step.id));

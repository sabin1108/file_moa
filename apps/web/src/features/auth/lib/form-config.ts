import type { WorkflowStep } from "../../../components/ui/WorkflowStepper";
import type { AuthFieldName, AuthOperation } from "../../../shared/auth-contract";
import type { SignupStage } from "./signup-flow";

export const signupSteps = [
  { id: "email", label: "이메일" }, { id: "password", label: "비밀번호" }, { id: "verification", label: "이메일 확인" }, { id: "complete", label: "완료" },
] as const satisfies readonly WorkflowStep[];
export const resetSteps = [
  { id: "request", label: "메일 받기" }, { id: "password", label: "비밀번호 변경" }, { id: "complete", label: "완료" },
] as const satisfies readonly WorkflowStep[];

export function signupOperation(step: unknown) { return step === "verification" ? "resend" : "signup"; }

export function authProgress(operation: AuthOperation, success: boolean, signupStage: SignupStage = "email") {
  if (operation === "signup" || operation === "resend" || operation === "verify") {
    const current = operation === "verify" && success ? "complete" : operation === "signup" ? signupStage : "verification";

    return { steps: signupSteps, current, label: "회원가입 진행 단계" };
  }
  if (operation === "request-reset" || operation === "reset") {
    const current = operation === "reset" ? success ? "complete" : "password" : "request";

    return { steps: resetSteps, current, label: "비밀번호 재설정 단계" };
  }
}

export type Field = { name: Exclude<AuthFieldName, "token">; label: string; type: "text" | "email" | "password"; autoComplete: string; minLength?: number; maxLength: number };
const email: Field = { name: "email", label: "이메일", type: "email", autoComplete: "email", maxLength: 254 };
const newPassword: Field = { name: "password", label: "비밀번호", type: "password", autoComplete: "new-password", minLength: 12, maxLength: 128 };
const confirm: Field = { ...newPassword, name: "passwordConfirm", label: "비밀번호 확인" };

export const authForms: Record<AuthOperation, { title: string; description: string; submit: string; fields: readonly Field[] }> = {
  login: { title: "모아 로그인", description: "사용할 로그인 방법을 선택해 주세요.", submit: "로그인", fields: [{ ...email, autoComplete: "username" }, { ...newPassword, minLength: 1, autoComplete: "current-password" }] },
  signup: { title: "모아 계정 만들기", description: "계정 정보를 입력하고 이메일 주소를 확인하세요.", submit: "가입하고 인증 메일 받기", fields: [email, newPassword, confirm] },
  profile: { title: "어떤 이름으로 불러드릴까요?", description: "가입을 마쳤습니다. 모아에서 사용할 표시 이름을 정해 주세요.", submit: "저장하고 시작하기", fields: [{ name: "name", label: "표시 이름", type: "text", autoComplete: "nickname", maxLength: 40 }] },
  resend: { title: "이메일을 확인해 주세요", description: "메일의 확인 링크를 열면 가입 절차를 이어갈 수 있어요.", submit: "인증 메일 다시 요청", fields: [email] },
  "request-reset": { title: "비밀번호 찾기", description: "가입한 이메일로 비밀번호 재설정 링크를 요청하세요.", submit: "재설정 메일 요청", fields: [email] },
  verify: { title: "이메일 주소 확인", description: "아래 버튼을 눌러 이 이메일 주소의 사용을 확인하세요.", submit: "이메일 주소 확인", fields: [] },
  reset: { title: "새 비밀번호 설정", description: "12자 이상 128자 이하의 새 비밀번호를 입력하세요.", submit: "비밀번호 변경", fields: [newPassword, confirm] },
  signout: { title: "나의 계정", description: "로그인한 계정을 확인하세요.", submit: "로그아웃", fields: [] },
};

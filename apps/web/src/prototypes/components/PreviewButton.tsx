import type { ReactNode } from "react";
import { actionClasses, type ActionVariant } from "../../components/ui/action-classes";

// 공통 디자인 시안 버튼. 실제 파일이나 API를 조작하지 않습니다.

export function PreviewButton({ children, className, label, variant = "ghost" }: {
  children: ReactNode;
  className?: string;
  label?: string;
  variant?: ActionVariant;
}) {
  return <button
    type="button"
    aria-disabled="true"
    className={actionClasses(variant, className)}
    aria-label={label}
    title="디자인 시안 · 실제 동작은 연결되지 않았어요"
  >
    {children}
  </button>;
}

import styles from "../../styles/controls.module.css";

/** 실제 조작과 시안이 공유하는 표시 규칙. 이벤트와 비활성 상태는 호출자가 소유한다. */
export type ActionVariant = "primary" | "secondary" | "ghost";
export function actionClasses(variant: ActionVariant, className?: string) {
  return [styles.action, styles[variant], className].filter(Boolean).join(" ");
}

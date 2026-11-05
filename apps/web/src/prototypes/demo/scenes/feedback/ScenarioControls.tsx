import { DemoButton } from "../../DemoButton";
import styles from "./feedback-scenes.module.css";

export function ScenarioControls<T extends string>({ value, options, onChange }: {
  value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <fieldset className={styles.controls}><legend>시안 상태 전환</legend><div>{options.map(option => <DemoButton key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</DemoButton>)}</div><p>실제 요청 없이 상태별 화면을 살펴봅니다.</p></fieldset>;
}

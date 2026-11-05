import { useId } from "react";
import { Icon } from "../../components/ui/Icon";
import styles from "./risk-summary.module.css";

type RiskTone = "attention" | "danger";
type Scope = { title: string; items: readonly string[] };

export function RiskNotice({ label, title, children, tone = "attention" }: {
  label: string; title: string; children: string; tone?: RiskTone;
}) {
  const heading = useId();
  return <section className={styles.notice} data-tone={tone} aria-labelledby={heading}>
    <Icon name="warning" size={24} />
    <div><span className={styles.label}>{label}</span><h3 id={heading}>{title}</h3><p>{children}</p></div>
  </section>;
}

// Presentation only: each scene owns the scope, consent and next action.
export function ImpactComparison({ affected, preserved, tone = "attention" }: {
  affected: Scope; preserved: Scope; tone?: RiskTone;
}) {
  return <div className={styles.comparison} data-tone={tone}>
    <section className={styles.affected}><h4>{affected.title}</h4><ul>{affected.items.map(item => <li key={item}>{item}</li>)}</ul></section>
    <section><h4>{preserved.title}</h4><ul>{preserved.items.map(item => <li key={item}>{item}</li>)}</ul></section>
  </div>;
}

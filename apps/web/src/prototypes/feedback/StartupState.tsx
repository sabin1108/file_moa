import type { ReactNode } from "react";
import { MoaMark } from "../../components/ui/Icon";
import { MoaLoader } from "../../components/ui/feedback/MoaLoader";
import styles from "./prototype-feedback.module.css";

export function StartupState({ state, title, detail, action }: {
  state: "loading" | "slow" | "error" | "ready";
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  const pending = state === "loading" || state === "slow";

  return <section className={styles.startup} data-state={state} aria-label="작업 공간 접속">
    <div className={styles.brand}>
      {pending ? <MoaLoader size={72} /> : <MoaMark size={72} />}
      <span>모아.</span>
    </div>
    <div role="status" aria-atomic="true">
      <h3>
        {title}
      </h3>
      <p>
        {detail}
      </p>
    </div>
    {action && <div className={styles.startupActions}>
      {action}
    </div>}
  </section>;
}
